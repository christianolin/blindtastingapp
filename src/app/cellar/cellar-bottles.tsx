"use client";

// The Bottles frame (CC-U3, spec §5.1 frame, §5.4 merge notice, §5.9 readOnly,
// D5, D6; refinements 7, 8, 13, 17, 20). One frame, two renders: `/cellar`
// mounts it with `readOnly={false}`, `/u/[id]/cellar` (CC-U8) with
// `readOnly={true}` over the same rows shape. Every derivation below is a
// pure CC-P1/CC-P2 helper over the `rows` prop — this file only wires state,
// the sheets and the `?lot=`/`?do=` query contract (D6) to them.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AddWineButton } from "@/components/add-wine-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NewNoteModal } from "@/components/new-note-modal";
import { NoteModal } from "@/components/wset/note-modal";
import { useMediaQuery } from "@/components/add-wine/use-camera";
import { readValue, writeValue } from "@/lib/safe-storage";
import { lotTitle } from "@/lib/cellar/format";
import { mergeGroups, mergeNotice } from "@/lib/cellar/storage-merge";
import {
  applyFilters,
  dimensionCounts,
  EMPTY_FILTERS,
  filterChips,
  filterOptions,
  foldSearch,
  footerLine,
  GRID_PAGE,
  groupHeaderLine,
  groupRows,
  headerStats,
  LIST_PAGE,
  matchesSearch,
  pageLabel,
  pageSlice,
  rangeLabel,
  searchPlaceholder,
  showMoreLabel,
  sortRows,
  visibleGroups,
} from "@/lib/cellar/cellar-rows";
import type {
  BottleRow,
  CellarView,
  FilterState,
  GroupKey,
  SortKey,
} from "@/lib/cellar/types";
import { mergeStorageLocations } from "./lot-actions";
import { BottleGrid } from "./bottle-grid";
import { BottleList } from "./bottle-list";
import type { RowCallbacks, Section } from "./row-actions";
import { CellarToolbar } from "./cellar-toolbar";
import { DimensionStrip } from "./dimension-strip";
import { DrinkSheet, type DrinkLot } from "./drink-sheet";
import { LotSheet } from "./lot-sheet";

const CELLAR_VIEW_KEY = "cellar-view";

// The list/grid choice as an external store (see the useSyncExternalStore
// note in CellarBottles). The in-memory value wins over storage so a blocked
// localStorage still lets the switch work for the visit.
const VIEW_LISTENERS = new Set<() => void>();
let memoryView: CellarView | null = null;
function subscribeView(listener: () => void): () => void {
  VIEW_LISTENERS.add(listener);
  return () => {
    VIEW_LISTENERS.delete(listener);
  };
}
function readStoredView(): CellarView {
  if (memoryView) return memoryView;
  return readValue(() => window.localStorage, CELLAR_VIEW_KEY) === "grid" ? "grid" : "list";
}
function serverView(): CellarView {
  return "list";
}
function storeView(v: CellarView): void {
  memoryView = v;
  writeValue(() => window.localStorage, CELLAR_VIEW_KEY, v);
  for (const listener of VIEW_LISTENERS) listener();
}

function drinkLotFrom(row: BottleRow): DrinkLot {
  return {
    lotId: row.lot.id,
    wineId: row.wine.catalogWineId,
    title: lotTitle(row.wine),
    quantity: row.lot.quantity,
    place: row.lot.storageLocation,
    community: row.community,
  };
}

const pageButtonCls =
  "inline-flex size-11 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-40 md:pointer-fine:size-8";

export function CellarBottles({
  rows,
  readOnly,
}: {
  rows: BottleRow[];
  readOnly: boolean;
}): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const phone = useMediaQuery("(max-width: 767px)");

  const [q, setQ] = useState("");
  const [group, setGroup] = useState<GroupKey>("none");
  const [sort, setSort] = useState<SortKey>("bottles");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  // The persisted list/grid choice is read through useSyncExternalStore with
  // a "list" server snapshot: reading localStorage in a useState initialiser
  // made the server render the list and the client the grid, which React
  // reports as a hydration mismatch and regenerates the whole tree (the same
  // trap LocalDateTime documents). The client snapshot only applies after
  // hydration, so a stored "grid" switches the view one paint later.
  const view = useSyncExternalStore(subscribeView, readStoredView, serverView);
  const [page, setPage] = useState(1);
  const [gridRest, setGridRest] = useState(false);
  const [groupsExpanded, setGroupsExpanded] = useState(false);
  const [openLot, setOpenLot] = useState<{ lotId: string; mode: "view" | "edit" } | null>(
    null,
  );
  const [drink, setDrink] = useState<DrinkLot | null>(null);
  const [note, setNote] = useState<{ noteId: string; wineId: string } | null>(null);
  const [rate, setRate] = useState<{ wineId: string; consumptionId: string | null } | null>(
    null,
  );
  const [lotReload, setLotReload] = useState(0);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const listTopRef = useRef<HTMLDivElement | null>(null);

  // Derivations (CC-P1/CC-P2 over `rows`) — every one is a pure function of
  // its inputs, so nothing here duplicates cellar-rows.ts's own logic.
  const counts = useMemo(() => dimensionCounts(rows), [rows]);
  const rowsStats = useMemo(() => headerStats(rows), [rows]);
  const needle = useMemo(() => foldSearch(q.trim()), [q]);
  const filtered = useMemo(
    () => applyFilters(rows, filters).filter((r) => matchesSearch(r, needle)),
    [rows, filters, needle],
  );
  const sorted = useMemo(() => sortRows(filtered, sort), [filtered, sort]);
  const options = useMemo(() => filterOptions(rows, filters), [rows, filters]);
  const chips = useMemo(() => filterChips(filters), [filters]);
  const footStats = useMemo(() => headerStats(filtered), [filtered]);

  const listPage = useMemo(() => pageSlice(sorted, page, LIST_PAGE), [sorted, page]);
  const gridRows = useMemo(
    () => (gridRest ? sorted : sorted.slice(0, GRID_PAGE)),
    [gridRest, sorted],
  );

  const groupsData = useMemo(
    () => (group === "none" ? [] : groupRows(sorted, group)),
    [group, sorted],
  );
  const { shown: shownGroups, hidden: hiddenGroups } = useMemo(
    () => visibleGroups(groupsData, groupsExpanded),
    [groupsData, groupsExpanded],
  );

  const sections: Section[] = useMemo(() => {
    if (group !== "none") {
      return shownGroups.map((g) => ({
        key: g.key,
        header: {
          label: g.label,
          sublabel: g.sublabel,
          line: {
            phone: groupHeaderLine(group, g.stats, { phone: true, readOnly }),
            laptop: groupHeaderLine(group, g.stats, { phone: false, readOnly }),
          },
        },
        rows: g.rows,
      }));
    }
    return [{ key: "all", header: null, rows: view === "list" ? listPage.rows : gridRows }];
  }, [group, shownGroups, readOnly, view, listPage.rows, gridRows]);

  const showClearAll = chips.length > 0 || q.trim() !== "";

  // §5.4: near-duplicate storage-location spellings, offered above the
  // grouped list only while grouped by "where" — !readOnly, since a
  // read-only cellar never merges anything of its own.
  const mergeCandidates = useMemo(
    () => mergeGroups(rows.map((r) => r.lot)),
    [rows],
  );
  const notice = useMemo(
    () => (readOnly || group !== "where" ? null : mergeNotice(mergeCandidates)),
    [readOnly, group, mergeCandidates],
  );

  function resetPaging() {
    setPage(1);
    setGridRest(false);
  }

  function handleSearch(v: string) {
    setQ(v);
    resetPaging();
  }
  function handleSort(v: SortKey) {
    setSort(v);
    resetPaging();
  }
  function handleFilters(v: FilterState) {
    setFilters(v);
    resetPaging();
  }
  function handleGroupChange(g: GroupKey) {
    setGroup(g);
    setGroupsExpanded(false);
    resetPaging();
  }
  function chooseView(v: CellarView) {
    storeView(v);
  }
  function clearAll() {
    setQ("");
    setFilters(EMPTY_FILTERS);
    resetPaging();
  }
  function goToPage(target: number) {
    setPage(target);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleMerge() {
    setMerging(true);
    setMergeError(null);
    for (const g of mergeCandidates) {
      const sources = g.variants.slice(1).map((v) => v.spelling);
      if (sources.length === 0) continue;
      const result = await mergeStorageLocations(sources, g.target);
      if ("error" in result) {
        setMergeError(result.error);
        setMerging(false);
        return;
      }
    }
    setMerging(false);
    router.refresh();
  }

  const cb: RowCallbacks = {
    onOpenLot: (lotId, mode = "view") => setOpenLot({ lotId, mode }),
    onDrink: (lotId) => {
      const row = rows.find((r) => r.lot.id === lotId);
      if (row) setDrink(drinkLotFrom(row));
    },
    onRate: (wineId) => setRate({ wineId, consumptionId: null }),
    onOpenNote: (noteId, wineId) => setNote({ noteId, wineId }),
  };

  // `?lot=` and `?do=` (owner only, D6): the redirected legacy routes
  // (CC-X2) land here as query params. Opening the sheet is a render-phase
  // state adjustment (the same "reset when a prop changes" pattern
  // lot-sheet.tsx/drink-sheet.tsx use), not a setState call inside an
  // effect, which the repo's cascading-render lint rule refuses; a `lot`
  // that names no row in `rows` opens nothing.
  const lotParam = readOnly ? null : searchParams.get("lot");
  const doParam = readOnly ? null : searchParams.get("do");
  const matchedLotRow =
    lotParam !== null ? rows.find((r) => r.lot.id === lotParam) : undefined;
  const queryKey =
    lotParam !== null || doParam !== null ? `${lotParam ?? ""}|${doParam ?? ""}` : null;

  const [handledQueryKey, setHandledQueryKey] = useState<string | null>(null);
  if (queryKey !== handledQueryKey) {
    setHandledQueryKey(queryKey);
    if (matchedLotRow) {
      setOpenLot({ lotId: matchedLotRow.lot.id, mode: doParam === "edit" ? "edit" : "view" });
      if (doParam === "drink") setDrink(drinkLotFrom(matchedLotRow));
    }
  }

  // Dropping `do` (and `lot` when it named no row) from the URL is a real
  // side effect (routing), so it alone stays in an effect — and it never
  // calls a state setter, so it never cascades.
  const cleanedQueryKey = useRef<string | null>(null);
  useEffect(() => {
    if (queryKey === null) {
      cleanedQueryKey.current = null;
      return;
    }
    if (cleanedQueryKey.current === queryKey) return;
    cleanedQueryKey.current = queryKey;
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("do");
    if (!matchedLotRow) rest.delete("lot");
    const query = rest.toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`, { scroll: false });
  }, [queryKey, matchedLotRow, searchParams, pathname, router]);

  // Keeps `?lot=` in sync with the open sheet via the raw History API below
  // — never `router.replace` — D6: nothing re-renders, so the filters, the
  // sort, the page and the scroll position survive behind the sheet.
  useEffect(() => {
    if (readOnly) return;
    const url = new URL(window.location.href);
    const lotId = openLot?.lotId ?? null;
    if (lotId) url.searchParams.set("lot", lotId);
    else url.searchParams.delete("lot");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  }, [openLot?.lotId, readOnly]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="font-heading text-lg font-medium">
          {readOnly ? "No bottles to show" : "Your cellar is empty"}
        </p>
        {!readOnly ? (
          <>
            {/* (plan copy) */}
            <p className="text-sm text-muted-foreground">
              Add the wines you own to see what you have and how it has been rated.
            </p>
            <AddWineButton
              kind="cellar"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 md:pointer-fine:min-h-9"
            >
              <Plus className="size-4" />
              Add a bottle
            </AddWineButton>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <DimensionStrip
        counts={counts}
        active={group}
        onPick={handleGroupChange}
        readOnly={readOnly}
      />

      <CellarToolbar
        search={q}
        onSearch={handleSearch}
        placeholder={searchPlaceholder(rowsStats.bottles, { phone })}
        group={group}
        onGroup={handleGroupChange}
        sort={sort}
        onSort={handleSort}
        filters={filters}
        onFilters={handleFilters}
        options={options}
        view={view}
        onView={chooseView}
      />

      {notice ? (
        <Card className="flex flex-col gap-2 border-gold/40 bg-gold/10 p-4">
          <p className="font-heading font-semibold">{notice.title}</p>
          <p className="text-sm text-muted-foreground">{notice.body}</p>
          {mergeError ? (
            <p role="alert" className="text-sm text-destructive">
              {mergeError}
            </p>
          ) : null}
          <div>
            <Button
              type="button"
              disabled={merging}
              onClick={() => void handleMerge()}
              className="min-h-11 md:pointer-fine:min-h-9"
            >
              {notice.button}
            </Button>
          </div>
        </Card>
      ) : null}

      <div ref={listTopRef}>
        {sorted.length === 0 && rows.length > 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
            {/* (plan copy) */}
            <p className="font-heading text-lg font-medium">Nothing to show</p>
            {showClearAll ? (
              <Button variant="ghost" onClick={clearAll}>
                Clear all
              </Button>
            ) : null}
          </div>
        ) : view === "list" ? (
          <BottleList sections={sections} group={group} readOnly={readOnly} cb={cb} />
        ) : (
          <BottleGrid sections={sections} group={group} readOnly={readOnly} cb={cb} />
        )}
      </div>

      {group !== "none" && hiddenGroups > 0 ? (
        <Button variant="outline" onClick={() => setGroupsExpanded(true)}>
          {showMoreLabel(hiddenGroups, group)}
        </Button>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>{footerLine({ chips, group, stats: footStats, readOnly })}</p>
        {group === "none" ? (
          view === "list" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous page"
                disabled={listPage.page <= 1}
                onClick={() => goToPage(listPage.page - 1)}
                className={pageButtonCls}
              >
                <ChevronLeft className="size-4" />
              </button>
              <span>{pageLabel(listPage.page, listPage.pages)}</span>
              <button
                type="button"
                aria-label="Next page"
                disabled={listPage.page >= listPage.pages}
                onClick={() => goToPage(listPage.page + 1)}
                className={pageButtonCls}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span>{rangeLabel(1, gridRows.length, sorted.length)} · 24 a page</span>
              {!gridRest && sorted.length > GRID_PAGE ? (
                <Button variant="ghost" onClick={() => setGridRest(true)}>
                  Show the rest
                </Button>
              ) : null}
            </div>
          )
        ) : null}
      </div>

      {!readOnly ? (
        <>
          <LotSheet
            lotId={openLot?.lotId ?? null}
            initialMode={openLot?.mode ?? "view"}
            reloadKey={lotReload}
            onClose={() => setOpenLot(null)}
            onDrink={(row) => setDrink(drinkLotFrom(row))}
            onRate={(wineId, consumptionId) => setRate({ wineId, consumptionId })}
            onOpenNote={(noteId, wineId) => setNote({ noteId, wineId })}
            onChanged={() => router.refresh()}
          />
          <DrinkSheet
            lot={drink}
            onClose={() => setDrink(null)}
            onDone={(r) => {
              setDrink(null);
              setLotReload((k) => k + 1);
              router.refresh();
              if (r.openNote) setRate({ wineId: r.wineId, consumptionId: r.consumptionId });
            }}
          />
          {note ? (
            <NoteModal
              noteId={note.noteId}
              wineId={note.wineId}
              onClose={() => {
                setNote(null);
                router.refresh();
              }}
            />
          ) : null}
          {rate ? (
            <NewNoteModal
              wineId={rate.wineId}
              consumptionId={rate.consumptionId}
              onClose={() => {
                setRate(null);
                setLotReload((k) => k + 1);
                router.refresh();
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
