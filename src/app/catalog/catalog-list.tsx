"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, Star, Wine } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/country-flag";
import { useAddWine } from "@/components/add-wine-context";
import { NewNoteModal } from "@/components/new-note-modal";
import { useMediaQuery } from "@/components/add-wine/use-camera";
import { fmtAvg, fmtScore } from "@/lib/cellar/format";
import {
  CATALOG_FILTERS,
  CATALOG_PAGE,
  CATALOG_SEARCH_PLACEHOLDER,
  CATALOG_SEARCH_PLACEHOLDER_PHONE,
  CATALOG_SORT_OPTIONS,
  DEFAULT_SORT,
  applyCatalogFilter,
  catalogFilterLabel,
  catalogPageLine,
  factsLine,
  matchesCatalogSearch,
  ownedBadge,
  phoneFactsLine,
  sortCatalog,
  type CatalogBand,
  type CatalogFilter,
  type CatalogRow,
  type CatalogSort,
} from "./catalog-list-math";

const selectCls =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground";

export function CatalogList({ rows, band }: { rows: CatalogRow[]; band: CatalogBand }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [sort, setSort] = useState<CatalogSort>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [noteWineId, setNoteWineId] = useState<string | null>(null);
  const { openAddWine } = useAddWine();
  const phone = useMediaQuery("(max-width: 767px)");

  // The chip counts come from the band, not a recount of `rows`: they are
  // the same {o}/{t} figures the header line already shows, and stay right
  // even for a wine the viewer owns or has tasted that fell outside the
  // newest-500 load (refinement 15 still lists that wine's row, but the
  // count itself should not depend on it having been fetched at all).
  const counts: Record<CatalogFilter, number> = {
    all: band.wines,
    cellar: band.owned,
    tasted: band.yourNotes,
  };
  const filtered = useMemo(() => {
    const byFilter = applyCatalogFilter(rows, filter);
    const bySearch = byFilter.filter((r) => matchesCatalogSearch(r, q));
    return sortCatalog(bySearch, sort);
  }, [rows, filter, q, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / CATALOG_PAGE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = filtered.slice(
    (clampedPage - 1) * CATALOG_PAGE,
    clampedPage * CATALOG_PAGE,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={phone ? CATALOG_SEARCH_PLACEHOLDER_PHONE : CATALOG_SEARCH_PLACEHOLDER}
            className="w-full pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="catalog-sort" className="hidden text-sm text-muted-foreground md:inline">
            Sort
          </label>
          <select
            id="catalog-sort"
            aria-label="Sort"
            className={selectCls}
            value={`${sort.key}:${sort.dir}`}
            onChange={(e) => {
              const opt = CATALOG_SORT_OPTIONS.find((o) => o.value === e.target.value);
              if (opt) setSort(opt.sort);
              setPage(1);
            }}
          >
            {CATALOG_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground md:inline">Filter</span>
          <div className="flex flex-wrap gap-2">
            {CATALOG_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => {
                  setFilter(f);
                  setPage(1);
                }}
                className={cn(
                  "min-h-11 rounded-full border px-3 text-sm transition-colors md:pointer-fine:min-h-8",
                  filter === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {catalogFilterLabel(f, counts[f], { phone })}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Phone rows */}
      <div className="flex flex-col gap-2 xl:hidden">
        {pageRows.map((r) => (
          <Link
            key={r.id}
            href={`/catalog/${r.id}`}
            className="flex min-h-11 items-start gap-3 rounded-xl border border-border p-3"
          >
            {r.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.imageUrl}
                alt=""
                className="size-11 shrink-0 rounded-md border border-border object-cover"
              />
            ) : (
              <span className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                <Wine className="size-5" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-muted-foreground">{r.producer}</span>
              <span className="block truncate font-medium">{r.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {phoneFactsLine(r)}
              </span>
            </span>
            <span className="shrink-0 text-right text-sm">
              {r.avgScore != null ? (
                <span className="inline-flex items-center gap-1 font-semibold text-gold-dark">
                  <Star className="size-3.5" />
                  {fmtAvg(r.avgScore)}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
              <span className="block text-xs text-muted-foreground">{r.noteCount} notes</span>
              <span className="mt-1 block font-semibold text-primary">{fmtScore(r.yours)}</span>
              {ownedBadge(r.owned) ? (
                <Badge className="mt-1 bg-gold/15 text-gold-dark">{ownedBadge(r.owned)}</Badge>
              ) : null}
            </span>
          </Link>
        ))}
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "No wines in the catalog yet." : "No wines match those filters."}
          </p>
        ) : null}
      </div>

      {/* Laptop table */}
      <div className="hidden overflow-hidden rounded-xl border border-border xl:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-[13rem]" />
            <col className="w-[6rem]" />
            <col className="w-[4.5rem]" />
            <col className="w-[7rem]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Wine</th>
              <th className="px-4 py-3 font-medium">Where it is from</th>
              <th className="px-4 py-3 text-right font-medium">Notes</th>
              <th className="px-4 py-3 text-right font-medium">Blind</th>
              <th className="px-4 py-3 text-right font-medium">Yours</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className="group border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link href={`/catalog/${r.id}`} className="block min-w-0">
                    <span className="block truncate text-xs text-muted-foreground">{r.producer}</span>
                    <span className="line-clamp-2 font-medium text-foreground">{r.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {factsLine(r) ?? "—"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.appellation}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <span className="block">{r.region ?? "—"}</span>
                  <span className="mt-1 inline-flex items-center gap-1.5">
                    {r.country ? <CountryFlag name={r.country} /> : null}
                    {r.country ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {r.avgScore != null ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-gold-dark tabular-nums">
                      <Star className="size-3.5" />
                      {fmtAvg(r.avgScore)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  <span className="block text-xs text-muted-foreground">{r.noteCount}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {r.appearances}
                </td>
                <td className="relative px-4 py-3 text-right">
                  <span className="font-semibold text-primary tabular-nums">{fmtScore(r.yours)}</span>
                  {ownedBadge(r.owned) ? (
                    <span className="block">
                      <Badge className="bg-gold/15 text-gold-dark">{ownedBadge(r.owned)}</Badge>
                    </span>
                  ) : null}
                  <div className="absolute top-1/2 right-2 flex -translate-y-1/2 gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Button
                      size="sm"
                      variant="outline"
                      render={<Link href={`/catalog/${r.id}`} />}
                      nativeButton={false}
                    >
                      Open
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setNoteWineId(r.id)}>
                      Rate it
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        openAddWine("cellar", { cellarWine: { id: r.id, label: r.title } })
                      }
                    >
                      Add to cellar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "No wines in the catalog yet." : "No wines match those filters."}
          </div>
        ) : null}
      </div>

      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{catalogPageLine(clampedPage, CATALOG_PAGE, filtered.length, sort)}</span>
          {pageCount > 1 ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Previous page"
                disabled={clampedPage <= 1}
                onClick={() => setPage(clampedPage - 1)}
                className="inline-flex size-11 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-40 md:pointer-fine:size-8"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span>
                Page {clampedPage} of {pageCount}
              </span>
              <button
                type="button"
                aria-label="Next page"
                disabled={clampedPage >= pageCount}
                onClick={() => setPage(clampedPage + 1)}
                className="inline-flex size-11 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-40 md:pointer-fine:size-8"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {noteWineId ? (
        <NewNoteModal wineId={noteWineId} onClose={() => setNoteWineId(null)} />
      ) : null}
    </div>
  );
}
