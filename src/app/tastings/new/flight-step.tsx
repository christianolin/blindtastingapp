"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Camera, ChevronDown, ChevronUp, Grape, Search, Wine, X } from "lucide-react";
import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";
import { Eyebrow } from "@/components/overview/eyebrow";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { useAddWine } from "@/components/add-wine-context";
import { addToFlight, searchAddWine } from "@/components/add-wine/actions";
import type { AddSource, AddWineStart, SearchGroups } from "@/components/add-wine/types";
import { moveWine, removeWine } from "@/app/tastings/[id]/actions";
import { cn } from "@/lib/utils";
import type { FlightRow, FlightSnapshot } from "./actions";

type ResultRow = {
  key: string;
  catalogWineId: string;
  title: string;
  meta: string;
  imageUrl: string | null;
  inFlight: boolean;
  source: AddSource;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// The three groups flattened in the handoff's order (cellar → catalog →
// tasted), one row per catalog wine, each stating its source.
function flattenGroups(g: SearchGroups): ResultRow[] {
  const rating = new Map(g.catalog.map((c) => [c.catalogWineId, c]));
  const rows: ResultRow[] = [];
  const seen = new Set<string>();
  const star = (id: string) => {
    const r = rating.get(id);
    return r?.avgScore != null ? `★ ${Math.round(r.avgScore)}` : null;
  };
  for (const l of g.cellar) {
    if (seen.has(l.catalogWineId)) continue;
    seen.add(l.catalogWineId);
    rows.push({
      key: `lot-${l.lotId}`,
      catalogWineId: l.catalogWineId,
      title: l.title,
      meta: [
        "In your cellar",
        l.rack,
        `${l.quantity} ${l.quantity === 1 ? "bottle" : "bottles"}`,
        l.drinkNow ? "drink now" : null,
        star(l.catalogWineId),
      ]
        .filter(Boolean)
        .join(" · "),
      imageUrl: l.imageUrl,
      inFlight: l.inFlight,
      source: { kind: "catalog", catalogWineId: l.catalogWineId },
    });
  }
  for (const c of g.catalog) {
    if (seen.has(c.catalogWineId)) continue;
    seen.add(c.catalogWineId);
    rows.push({
      key: `cat-${c.catalogWineId}`,
      catalogWineId: c.catalogWineId,
      title: c.title,
      meta: [
        "Catalog",
        c.subtitle,
        star(c.catalogWineId),
        c.noteCount > 0 ? `${c.noteCount} ${c.noteCount === 1 ? "note" : "notes"}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      imageUrl: c.imageUrl,
      inFlight: c.inFlight,
      source: { kind: "catalog", catalogWineId: c.catalogWineId },
    });
  }
  for (const t of g.tasted) {
    if (seen.has(t.catalogWineId)) continue;
    seen.add(t.catalogWineId);
    const month = MONTHS[new Date(t.tastedOn).getMonth()] ?? null;
    rows.push({
      key: `tasted-${t.catalogWineId}`,
      catalogWineId: t.catalogWineId,
      title: t.title,
      meta: [
        "You have tasted before",
        t.myScore != null ? `you rated it ${t.myScore}${month ? ` in ${month}` : ""}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      imageUrl: t.imageUrl,
      inFlight: rating.get(t.catalogWineId)?.inFlight ?? false,
      source: { kind: "catalog", catalogWineId: t.catalogWineId },
    });
  }
  return rows;
}

/**
 * Step 2 · the wines (handoff 6b): the add-wine search row inline — a plain
 * field that searches on desktop and adds on ↵ / Add, three shortcut chips
 * into the universal add-wine sheet (camera / cellar / by hand) — then the
 * ordered flight with ▲▼ reorder and per-row remove. On phones the field
 * itself opens the sheet in search mode (nothing actionable may live under
 * a phone keyboard). Rows come from `listFlight` (server) so the sheet and
 * the lobby apply one set of rules; this component owns only order and
 * the optimistic remove.
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [searching, startSearch] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  // Optimistic order / removal over the server snapshot.
  const [rows, setRows] = useState<FlightRow[]>(snapshot?.wines ?? []);
  // A fresh server snapshot replaces the optimistic order (render-phase
  // derived state, not an effect — no extra render pass).
  const [seenSnapshot, setSeenSnapshot] = useState(snapshot);
  if (snapshot !== seenSnapshot) {
    setSeenSnapshot(snapshot);
    setRows(snapshot?.wines ?? []);
  }
  // Serialise every position-mutating write (move AND remove): two
  // overlapping swaps would collide on the (tasting_id, position) unique
  // constraint via the shared temp slot, and a remove's ascending compaction
  // could land on a row parked at -1 mid-swap.
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());

  const isByo = wineSource === "PARTICIPANT_CONTRIBUTED";
  const nextPosition = rows.length + 1;

  const openSheet = (start: AddWineStart) =>
    openAddWineSheet(
      {
        kind: "flight",
        tastingId,
        tastingName,
        revealMode,
        wineSource,
        position: nextPosition,
      },
      { start, onAdded: onChanged },
    );

  useEffect(() => {
    if (!isDesktop) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) return;
    debounceRef.current = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      startSearch(async () => {
        const groups = await searchAddWine(q, { tastingId });
        if (requestId === requestIdRef.current) setResults(flattenGroups(groups));
      });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tastingId, isDesktop]);

  async function add(row: ResultRow) {
    if (busy || row.inFlight) return;
    setBusy(true);
    setError(null);
    try {
      const r = await addToFlight(tastingId, row.source);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setQuery("");
      setResults([]);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  function move(id: string, direction: "up" | "down") {
    setRows((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (idx === -1 || target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    const fd = new FormData();
    fd.set("tasting_id", tastingId);
    fd.set("wine_id", id);
    fd.set("direction", direction);
    const run = writeQueue.current.then(() => moveWine(fd));
    writeQueue.current = run.catch(() => {});
    void run.then(onChanged);
  }

  async function remove(row: FlightRow) {
    setError(null);
    setRows((prev) => prev.filter((w) => w.id !== row.id));
    const run = writeQueue.current.then(() => removeWine(tastingId, row.id));
    writeQueue.current = run.catch(() => {});
    const r = await run;
    if ("error" in r) setError(r.error);
    onChanged();
  }

  const firstAddable = results.find((r) => !r.inFlight) ?? null;
  const showResults = isDesktop && query.trim().length > 0;

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
                if (!e.target.value.trim()) setResults([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (firstAddable) void add(firstAddable);
                }
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
          <span className="flex w-full items-center gap-[8px] text-[11.5px] md:ml-auto md:w-auto md:gap-[10px]">
            <ShortcutChip onClick={() => openSheet("camera")} icon={<Camera className="size-3.5" />}>
              Scan a label
            </ShortcutChip>
            <ShortcutChip onClick={() => openSheet("cellar")} icon={<Wine className="size-3.5" />}>
              From my cellar
            </ShortcutChip>
            <ShortcutChip onClick={() => openSheet("byhand")} icon={<Grape className="size-3.5" />}>
              Enter manually
            </ShortcutChip>
          </span>
        </div>

        {showResults ? (
          <div className="overflow-hidden rounded-b-[10px] border border-t-0 border-gold bg-white">
            {results.length === 0 ? (
              <p className="p-[11px_14px] text-[12.5px] text-muted-foreground">
                {searching ? "Searching…" : "Nothing matches — try Enter manually."}
              </p>
            ) : (
              results.map((r, i) => {
                const primary = firstAddable !== null && r.key === firstAddable.key;
                return (
                  <div
                    key={r.key}
                    className={cn(
                      "flex items-center gap-3 p-[11px_14px]",
                      i > 0 && "border-t border-border-light",
                      primary && "bg-gold/12",
                      r.inFlight && "opacity-60",
                    )}
                  >
                    <HatchThumb src={r.imageUrl} width={30} height={40} />
                    <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                      <span className="truncate text-[14px] font-semibold">{r.title}</span>
                      <span className="truncate text-[11.5px] text-muted-foreground">
                        {r.meta}
                      </span>
                    </span>
                    {r.inFlight ? (
                      <span className="text-[11.5px] text-muted-foreground">in flight</span>
                    ) : primary ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void add(r)}
                        className="font-mono text-[10.5px] text-muted-foreground hover:text-primary disabled:opacity-60"
                      >
                        ↵ adds it
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void add(r)}
                        className="rounded-[7px] border border-border px-3 py-[6px] text-[12.5px] font-semibold text-primary transition-colors hover:border-gold hover:bg-white disabled:opacity-60"
                      >
                        Add
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-[12.5px] text-destructive">
          {error}
        </p>
      ) : null}

      {/* Poured in this order */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-[10px] gap-y-1">
          <Eyebrow size="sm">Poured in this order</Eyebrow>
          <span className="text-[12px] text-muted-foreground md:ml-auto">
            Reorder · tasters only ever see the number
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
            No wines yet — search above, scan a label or enter one by hand.
          </p>
        ) : null}

        {rows.length > 0 || (isByo && snapshot && snapshot.waitingFor.length > 0) ? (
          <ul className="flex flex-col gap-[7px]">
            {rows.map((w, i) => (
              <li
                key={w.id}
                className="flex items-center gap-[10px] rounded-[9px] border border-border bg-white p-[8px_10px] md:gap-3 md:p-[10px_13px]"
              >
                <span className="w-[14px] shrink-0 font-heading text-[16px] font-semibold text-muted-foreground lining-nums tabular-nums">
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-px md:flex-row md:items-center md:gap-3">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                    {w.title}
                  </span>
                  {w.meta ? (
                    <span className="truncate text-[11.5px] text-muted-foreground">{w.meta}</span>
                  ) : null}
                </span>
                {w.canReorder ? (
                  <span className="flex shrink-0 items-center">
                    <IconButton
                      label="Move up"
                      disabled={i === 0 || busy}
                      onClick={() => move(w.id, "up")}
                    >
                      <ChevronUp className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Move down"
                      disabled={i === rows.length - 1 || busy}
                      onClick={() => move(w.id, "down")}
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
