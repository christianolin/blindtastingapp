"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Camera, ChevronDown, ChevronUp, Grape, GripVertical, Search, Upload, Wine, X } from "lucide-react";
import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";
import { Eyebrow } from "@/components/overview/eyebrow";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { useAddWine } from "@/components/add-wine-context";
import { addToFlight, searchAddWine } from "@/components/add-wine/actions";
import { ConsumeCheckbox } from "@/components/add-wine/cellar-view";
import { flattenSearchGroups, type DesktopRow } from "@/components/add-wine/desktop-format";
import { RowActionButton } from "@/components/add-wine/desktop-view";
import { sheetMatrix } from "@/components/add-wine/matrix";
import { useCanScan } from "@/components/add-wine/use-can-scan";
import type {
  AddSource,
  AddWineDestination,
  AddWineStart,
  SearchGroups,
} from "@/components/add-wine/types";
import { removeWine } from "@/app/tastings/[id]/actions";
import { moveFlightGlass } from "@/app/tastings/[id]/flight-actions";
import { dropIndex, reorderIds } from "@/lib/flight-glass-rules";
import { cn } from "@/lib/utils";
import type { FlightRow, FlightSnapshot } from "./actions";
import { PASTE_LIST_BUTTON } from "./paste-list";
import { PasteListPanel } from "./paste-list-panel";

/**
 * A search reply and what it answers: the text searched, and FlightStep's
 * `flight` count when the search went out.
 */
type SearchReply = { query: string; flight: number; groups: SearchGroups };

/**
 * Step 2 · the wines (handoff 6b): the add-wine search row inline, three
 * shortcut chips into the universal add-wine sheet on a line of their own
 * below it, then the ordered flight with ▲▼ reorder and per-row remove. Rows
 * come from `listFlight` (server), so the sheet and the lobby apply one set of
 * rules (the knowledge rule, spec §C.9); this component owns only order and
 * the optimistic remove.
 *
 * Everything that depends on the destination comes from the flight's matrix
 * (spec §C.6, D13):
 * - The chips: "Scan a label" where the device can scan (`canScan`, D5),
 *   otherwise "Upload photos", where the same `start: "camera"` lands on the
 *   laptop view's upload zone; "My cellar" when the matrix offers the cellar
 *   as a source; "By hand".
 * - The inline search, on laptop widths only (on phones the field opens the
 *   sheet's search: nothing actionable may live under a phone keyboard), lists
 *   the laptop view's rows with the laptop cells' labels on the same
 *   `RowActionButton` (owner feedback 2026-09-12). A cellar lot pours that
 *   bottle, carrying the draw-down choice under the list (C.7); a catalog or
 *   tasted hit is a catalog add. In-flight rows follow the server's flags. The
 *   row ↵ adds is marked by its gold tint alone.
 * - A search reply lists rows only for the flight as it was when the search
 *   went out, and ↵ acts only once the rows answer the text typed (A8, the
 *   laptop view's rule). Clearing the field, or an inline add returning,
 *   retires every search still on its way, so a late reply never lists or
 *   pours anything (amendment 23).
 * - The adder's own unfinished glass reads `flightRowNeeds` in dark gold, and
 *   its Edit opens the sheet's by-hand form on that glass (C.8).
 */
export function FlightStep({
  tastingId,
  tastingName,
  revealMode,
  wineSource,
  snapshot,
  onChanged,
  isDesktop,
}: {
  tastingId: string;
  tastingName: string;
  revealMode: RevealMode;
  wineSource: WineSourceMode;
  snapshot: FlightSnapshot | null;
  /** A wine was added / removed / reordered — the sheet re-reads the flight. */
  onChanged: () => void;
  isDesktop: boolean;
}) {
  const { openAddWineSheet } = useAddWine();
  // Null until the device check resolves; until then the chip offers Upload.
  const canScan = useCanScan() === true;
  const [query, setQuery] = useState("");
  // The newest search reply, with what it answers.
  const [found, setFound] = useState<SearchReply | null>(null);
  const [searching, startSearch] = useTransition();
  // Counts the flight changes that a listed row's in-flight flag may predate:
  // every add, glass save or remove made here or through the add-wine sheet
  // (`flightChanged`), and every fresh snapshot.
  const [flight, setFlight] = useState(0);
  const [busy, setBusy] = useState(false);
  // The result row whose add is running — its button shows the loader.
  const [addingKey, setAddingKey] = useState<string | null>(null);
  // C.7: "Take it out of the cellar when we pour it", checked by default.
  const [consume, setConsume] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A lot add that went in with a warning ("Added — but …").
  const [notice, setNotice] = useState<string | null>(null);
  // Only the newest search lands; bumping this retires every search on its way.
  const requestIdRef = useRef(0);
  // Optimistic order / removal over the server snapshot.
  const [rows, setRows] = useState<FlightRow[]>(snapshot?.wines ?? []);
  // A fresh server snapshot replaces the optimistic order (render-phase
  // derived state, not an effect — no extra render pass).
  const [seenSnapshot, setSeenSnapshot] = useState(snapshot);
  if (snapshot !== seenSnapshot) {
    setSeenSnapshot(snapshot);
    setRows(snapshot?.wines ?? []);
    // The flight may have changed under the listed rows: search them again.
    setFlight((n) => n + 1);
  }
  // Serialise every position-mutating write (move AND remove): two
  // overlapping swaps would collide on the (tasting_id, position) unique
  // constraint via the shared temp slot, and a remove's ascending compaction
  // could land on a row parked at -1 mid-swap.
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  // "Paste a list" (spec §2.3 item 7): a secondary text button opens the
  // panel inline under the flight.
  const [pasteOpen, setPasteOpen] = useState(false);
  const pasteOpenRef = useRef(false);
  const setPasteOpenState = (open: boolean) => {
    pasteOpenRef.current = open;
    setPasteOpen(open);
  };
  // Drag handles (spec §2.3 item 6): every row's DOM node, kept for
  // `getBoundingClientRect()` at pointerdown, and the in-flight drag.
  const rowElsRef = useRef(new Map<string, HTMLLIElement>());
  const draggingRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    id: string;
    startY: number;
    rowIds: string[];
    rowRects: { top: number; height: number }[];
  } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDy, setDragDy] = useState(0);

  const isByo = wineSource === "PARTICIPANT_CONTRIBUTED";
  const nextPosition = rows.length + 1;

  // One destination for the sheet, the inline adds and the result rows' label,
  // so all three say the same glass number.
  const destination: Extract<AddWineDestination, { kind: "flight" }> = {
    kind: "flight",
    tastingId,
    tastingName,
    revealMode,
    wineSource,
    position: nextPosition,
  };
  // The inline search is the laptop's, so it reads the laptop cells.
  const matrix = sheetMatrix(destination, false);
  const includeCellar = matrix.searchGroups.includes("cellar");
  // The flight changed, or may have: no search sent before now lands, and the
  // rows are searched again before any is listed. Called straight from each
  // add, save and remove, so a failed re-read of the flight cannot leave rows
  // with old in-flight flags listed.
  const flightChanged = () => {
    requestIdRef.current++;
    setFlight((n) => n + 1);
  };
  // Every add and glass save the add-wine sheet makes.
  const sheetAdded = () => {
    flightChanged();
    onChanged();
  };
  const openSheet = (start: AddWineStart) =>
    openAddWineSheet(destination, { start, onAdded: sheetAdded });
  const openEdit = (wineId: string) =>
    openAddWineSheet(destination, { start: "byhand", edit: { wineId }, onAdded: sheetAdded });

  const q = query.trim();

  // The inline search, 250ms after the text or the flight last changed.
  useEffect(() => {
    if (!isDesktop || !q) return;
    const timer = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      startSearch(async () => {
        const groups = await searchAddWine(q, { tastingId });
        if (requestId === requestIdRef.current) setFound({ query: q, flight, groups });
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [q, tastingId, isDesktop, flight]);

  // Contributor rows arrive (spec §2.3 item 8; CREATE-38): in bring-your-own,
  // step 2 re-reads the flight every 5 seconds while it is open (mounted) and
  // the tab is visible, so the sheet's own `refreshFlight` picks up rows the
  // others add. Never through a `listFlight` call of its own (BT-A0) — only
  // the `onChanged` prop the sheet passed down. A read never interrupts a
  // drag or the paste panel, and waits for the write queue to drain.
  useEffect(() => {
    if (!isByo) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (draggingRef.current || pasteOpenRef.current) return;
      void writeQueue.current.then(onChanged);
    }, 5000);
    return () => window.clearInterval(id);
  }, [isByo, onChanged]);

  // Rows read before the flight last changed are never listed: their in-flight
  // flags may be out of date, and the server has no duplicate check (§C.9).
  const listed = q !== "" && found !== null && found.flight === flight ? found.groups : null;
  const results = listed ? flattenSearchGroups(listed, { includeCellar }) : [];
  // The previous text's rows stay listed while the new search runs, but ↵
  // waits until the rows answer what is typed (A8; desktop-view.tsx's rule).
  const stale = searching || found === null || found.query !== q || found.flight !== flight;
  const cellFor = (row: DesktopRow) =>
    matrix.row({ source: row.listedAs, inFlight: row.inFlight, owned: row.source.kind === "lot" });
  const firstAddable = results.find((r) => !cellFor(r).disabled) ?? null;
  const lotsListed = results.some((r) => r.source.kind === "lot");
  const showResults = isDesktop && q.length > 0;

  async function add(row: DesktopRow) {
    if (busy || cellFor(row).disabled) return;
    // The text this add came from: the field clears only while it still holds it.
    const addedFrom = q;
    // A cellar lot pours that bottle and carries the draw-down choice (C.7);
    // any other hit adds its catalog wine.
    const source: AddSource =
      row.source.kind === "lot"
        ? { kind: "lot", lotId: row.source.lotId, consume, catalogWineId: row.catalogWineId }
        : { kind: "catalog", catalogWineId: row.catalogWineId, via: "search" };
    setBusy(true);
    setAddingKey(row.key);
    setError(null);
    setNotice(null);
    try {
      const r = await addToFlight(destination, source);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      if (r.warning) setNotice(r.warning);
      // Text typed while the add ran stays, and is searched again below.
      setQuery((text) => (text.trim() === addedFrom ? "" : text));
      onChanged();
    } finally {
      // Whatever came back (an add, a refusal, a failed call), the flight may
      // have changed: no search sent before now may land, and the rows are
      // read again before any is listed.
      flightChanged();
      setBusy(false);
      setAddingKey(null);
    }
  }

  // Drag handles and the ▲▼ fallback both land here (spec §2.3 item 6): the
  // list reorders optimistically with `reorderIds`, then `moveFlightGlass`
  // through the step's write queue; a refusal reverts the optimistic order
  // and shows the RPC's own sentence inline.
  async function reorderTo(id: string, toIndex: number) {
    const ids = rows.map((r) => r.id);
    const next = reorderIds(ids, id, toIndex);
    if (next === null || next.every((rid, i) => rid === ids[i])) return;
    const prevRows = rows;
    const byId = new Map(rows.map((r) => [r.id, r]));
    setRows(next.map((rid) => byId.get(rid)!));
    setError(null);
    const run = writeQueue.current.then(() => moveFlightGlass(tastingId, id, toIndex));
    writeQueue.current = run.catch(() => {});
    const r = await run;
    if ("error" in r) {
      setRows(prevRows);
      setError(r.error);
      return;
    }
    onChanged();
  }

  function moveByStep(id: string, direction: "up" | "down") {
    const idx = rows.findIndex((w) => w.id === id);
    if (idx === -1) return;
    void reorderTo(id, direction === "up" ? idx : idx + 2);
  }

  // Pointer-drag reorder (spec §2.3 item 6): rects are measured once at
  // pointerdown (`getBoundingClientRect()`, the pointer's coordinate space)
  // and never re-measured mid-drag, per `dropIndex`'s own recipe — only the
  // dragged row's own rect is swapped out (for `{ top: pointerY, height: 0 }`)
  // at drop time. Other rows stay put visually; the dragged row follows the
  // pointer through a translateY.
  function endDrag() {
    dragRef.current = null;
    draggingRef.current = false;
    setDragId(null);
    setDragDy(0);
  }

  function onHandlePointerDown(e: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (busy) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rowIds = rows.map((r) => r.id);
    const rowRects = rowIds.map((rid) => {
      const rect = rowElsRef.current.get(rid)?.getBoundingClientRect();
      return { top: rect?.top ?? 0, height: rect?.height ?? 0 };
    });
    dragRef.current = { pointerId: e.pointerId, id, startY: e.clientY, rowIds, rowRects };
    draggingRef.current = true;
    setDragId(id);
    setDragDy(0);
  }

  function onHandlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setDragDy(e.clientY - d.startY);
  }

  function onHandlePointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) {
      endDrag();
      return;
    }
    const idx = d.rowIds.indexOf(d.id);
    endDrag();
    if (idx === -1) return;
    const rects = d.rowRects.map((r, i) => (i === idx ? { top: e.clientY, height: 0 } : r));
    void reorderTo(d.id, dropIndex(rects, e.clientY));
  }

  function onHandlePointerCancel(e: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    endDrag();
  }

  async function remove(row: FlightRow) {
    setError(null);
    setRows((prev) => prev.filter((w) => w.id !== row.id));
    const run = writeQueue.current.then(() => removeWine(tastingId, row.id));
    writeQueue.current = run.catch(() => {});
    const r = await run;
    if ("error" in r) setError(r.error);
    flightChanged();
    onChanged();
  }

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Search row + shortcut chips */}
      <div className="relative flex flex-col">
        <div
          className={cn(
            "flex flex-wrap items-center gap-[10px] border border-border bg-white p-[12px_14px] transition-colors focus-within:border-[1.5px] focus-within:border-primary focus-within:p-[11.5px_13.5px]",
            showResults ? "rounded-t-[10px]" : "rounded-[10px]",
          )}
        >
          <Search className="size-4 shrink-0 text-primary" aria-hidden />
          {isDesktop ? (
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // A cleared field retires the search on its way: its rows
                // never come back under the next text.
                if (!e.target.value.trim()) {
                  requestIdRef.current++;
                  setFound(null);
                }
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                // While a search runs the rows listed may answer the previous
                // text, so ↵ waits for the rows of what is typed.
                if (!stale && firstAddable) void add(firstAddable);
              }}
              placeholder="Search — producer, wine or appellation"
              aria-label="Search for a wine to add"
              autoComplete="off"
              className="min-w-[160px] flex-1 bg-transparent text-[15px] outline-none placeholder:text-placeholder"
            />
          ) : (
            <button
              type="button"
              onClick={() => openSheet("search")}
              className="min-h-11 flex-1 text-left text-[15px] text-placeholder"
            >
              Search — producer, wine or appellation
            </button>
          )}
          {isDesktop ? (
            // The same hint as the sheet's desktop view (7h).
            <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground">
              {matrix.enterHint}
            </span>
          ) : null}
          {/* The shortcuts take a line of their own at every width: beside
              the field and its ↵ hint they do not fit the 760px sheet. On
              desktop they line up with the field's text. */}
          <span className="flex w-full items-center gap-[8px] text-[11.5px] md:gap-[10px] md:pl-[26px]">
            {/* D5: the live camera only where the device can scan; anywhere
                else the same start lands on the laptop view's upload zone. */}
            <ShortcutChip
              onClick={() => openSheet("camera")}
              icon={canScan ? <Camera className="size-3.5" /> : <Upload className="size-3.5" />}
            >
              {canScan ? "Scan a label" : "Upload photos"}
            </ShortcutChip>
            {matrix.cellarSource ? (
              <ShortcutChip onClick={() => openSheet("cellar")} icon={<Wine className="size-3.5" />}>
                My cellar
              </ShortcutChip>
            ) : null}
            <ShortcutChip onClick={() => openSheet("byhand")} icon={<Grape className="size-3.5" />}>
              By hand
            </ShortcutChip>
          </span>
        </div>

        {showResults ? (
          <div className="overflow-hidden rounded-b-[10px] border border-t-0 border-gold bg-white">
            {results.length === 0 ? (
              <p className="p-[11px_14px] text-[12.5px] text-muted-foreground">
                {stale ? "Searching…" : "Nothing matches — try By hand."}
              </p>
            ) : (
              results.map((r, i) => {
                const cell = cellFor(r);
                // The row ↵ adds: its gold tint is the only mark — its
                // button is the same as every other row's.
                const enterTarget = firstAddable !== null && r.key === firstAddable.key;
                return (
                  <div
                    key={r.key}
                    className={cn(
                      "flex items-center gap-3 p-[11px_14px]",
                      i > 0 && "border-t border-border-light",
                      enterTarget && "bg-gold/12",
                      cell.disabled && "opacity-70",
                    )}
                  >
                    <HatchThumb src={r.imageUrl} width={30} height={40} />
                    <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                      <span className="truncate text-[14px] font-semibold">{r.title}</span>
                      <span className="truncate text-[11.5px] text-muted-foreground">
                        {r.meta}
                      </span>
                    </span>
                    <RowActionButton
                      label={cell.label}
                      wineTitle={r.title}
                      inFlight={cell.disabled}
                      pending={addingKey === r.key}
                      disabled={busy}
                      onClick={() => void add(r)}
                    />
                  </div>
                );
              })
            )}
            {lotsListed && matrix.consumeLabel ? (
              <div className="border-t border-border-light p-[10px_14px]">
                <ConsumeCheckbox
                  checked={consume}
                  onChange={setConsume}
                  disabled={busy}
                  label={matrix.consumeLabel}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-[12.5px] text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-[12.5px] text-gold-dark">
          {notice}
        </p>
      ) : null}

      {/* Poured in this order */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-[10px] gap-y-1">
          <Eyebrow size="sm">Poured in this order</Eyebrow>
          <span className="text-[12px] text-muted-foreground md:ml-auto">
            {/* create-6 (spec §D.1 #6): bring-your-own glasses carry their
                contributor's name. */}
            {isByo
              ? "Reorder · tasters see whose bottle each glass is"
              : "Reorder · tasters only ever see the number"}
          </span>
          <span className="text-[12px] text-muted-foreground max-md:hidden">·</span>
          <span className="text-[12px] font-semibold text-primary max-md:hidden">
            add more later
          </span>
        </div>

        {snapshot === null ? (
          <p className="text-[12.5px] text-muted-foreground">Loading the flight…</p>
        ) : rows.length === 0 && (snapshot.waitingFor.length === 0 || !isByo) ? (
          <p className="rounded-[9px] border border-dashed border-border p-[10px_13px] text-[12.5px] text-muted-foreground">
            No wines yet — search above, {canScan ? "scan a label" : "upload label photos"} or
            enter one by hand.
          </p>
        ) : null}

        {rows.length > 0 || (isByo && snapshot && snapshot.waitingFor.length > 0) ? (
          <ul className="flex flex-col gap-[7px]">
            {rows.map((w, i) => (
              <li
                key={w.id}
                ref={(el) => {
                  if (el) rowElsRef.current.set(w.id, el);
                  else rowElsRef.current.delete(w.id);
                }}
                style={dragId === w.id ? { transform: `translateY(${dragDy}px)` } : undefined}
                className={cn(
                  "relative flex items-center gap-[10px] rounded-[9px] border border-border bg-white p-[8px_10px] md:gap-3 md:p-[10px_13px]",
                  dragId === w.id && "z-10 border-gold shadow-lg",
                )}
              >
                {w.canReorder ? (
                  <button
                    type="button"
                    aria-label={`Drag to reorder ${w.title}`}
                    disabled={busy}
                    onPointerDown={(e) => onHandlePointerDown(e, w.id)}
                    onPointerMove={onHandlePointerMove}
                    onPointerUp={onHandlePointerUp}
                    onPointerCancel={onHandlePointerCancel}
                    onLostPointerCapture={onHandlePointerCancel}
                    className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing md:size-8"
                  >
                    <GripVertical className="size-4" />
                  </button>
                ) : null}
                <span className="w-[14px] shrink-0 font-heading text-[16px] font-semibold text-muted-foreground lining-nums tabular-nums">
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-px md:flex-row md:items-center md:gap-3">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                    {w.title}
                  </span>
                  {w.meta ? (
                    <span
                      className={cn(
                        "text-[11.5px]",
                        // The adder's unfinished glass: its needs line wraps
                        // on a phone rather than hiding what is missing.
                        w.incomplete ? "text-gold-dark md:truncate" : "truncate text-muted-foreground",
                      )}
                    >
                      {w.meta}
                    </span>
                  ) : null}
                </span>
                {w.incomplete && w.editable ? (
                  <button
                    type="button"
                    aria-label={`Edit ${w.title}`}
                    onClick={() => openEdit(w.id)}
                    className="flex min-h-11 shrink-0 items-center rounded-[6px] border border-border bg-background px-3 text-[12px] font-semibold text-primary transition-colors hover:border-gold hover:bg-white md:min-h-8 md:px-2.5"
                  >
                    Edit
                  </button>
                ) : null}
                {w.canReorder ? (
                  <span className="flex shrink-0 items-center">
                    <IconButton
                      label="Move up"
                      disabled={i === 0 || busy}
                      onClick={() => moveByStep(w.id, "up")}
                    >
                      <ChevronUp className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Move down"
                      disabled={i === rows.length - 1 || busy}
                      onClick={() => moveByStep(w.id, "down")}
                    >
                      <ChevronDown className="size-4" />
                    </IconButton>
                  </span>
                ) : null}
                {w.canReorder && !snapshot?.hasStarted ? (
                  <IconButton label={`Remove ${w.title}`} onClick={() => void remove(w)}>
                    <X className="size-[14px]" />
                  </IconButton>
                ) : null}
              </li>
            ))}
            {isByo
              ? (snapshot?.waitingFor ?? []).map((name, i) => (
                  <li
                    key={`waiting-${name}-${i}`}
                    className="flex items-center gap-[10px] rounded-[9px] border border-dashed border-gold bg-background p-[10px_13px] md:gap-3"
                  >
                    <span className="w-[14px] shrink-0 font-heading text-[16px] font-semibold text-muted-foreground lining-nums tabular-nums">
                      {rows.length + i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-muted-foreground">
                      {name}&apos;s wine
                    </span>
                    <span className="shrink-0 text-[11.5px] font-semibold text-gold-dark">
                      waiting for {name} to add it
                    </span>
                  </li>
                ))
              : null}
          </ul>
        ) : null}

        {isByo ? (
          <p className="max-w-[46ch] text-[12px] leading-[1.45] text-muted-foreground">
            In everyone-brings mode the others add their own wines from the same
            sheet — their rows appear here as they do it.
          </p>
        ) : null}
      </div>

      {/* Paste a list (spec §2.3 item 7): a secondary text button opens the
          panel inline — not a nested dialog. */}
      <div className="flex flex-col gap-[8px]">
        <button
          type="button"
          onClick={() => setPasteOpenState(!pasteOpen)}
          className="inline-flex min-h-11 items-center self-start text-[12.5px] font-semibold text-primary hover:underline md:min-h-0"
        >
          {PASTE_LIST_BUTTON}
        </button>
        {pasteOpen ? (
          <PasteListPanel destination={destination} onAdded={sheetAdded} />
        ) : null}
      </div>
    </div>
  );
}

function ShortcutChip({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 flex-1 items-center justify-center gap-[5px] rounded-[6px] border border-border bg-background px-2 text-[11.5px] font-semibold text-primary transition-colors hover:border-gold hover:bg-white md:min-h-0 md:flex-none md:px-2 md:py-[3px]"
    >
      <span className="max-md:hidden">{icon}</span>
      {children}
    </button>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent md:size-8"
    >
      {children}
    </button>
  );
}
