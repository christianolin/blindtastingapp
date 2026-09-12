"use client";

import { useEffect, useId, useState } from "react";
import { Camera, ChevronRight, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/overview/eyebrow";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { actionButtonClass } from "@/components/overview/action-button";
import { cn } from "@/lib/utils";
import { searchAddWine } from "./actions";
import { ConsumeCheckbox } from "./cellar-view";
import { bottlesLabel, catalogMeta, searchCellarMeta, tastedMeta } from "./row-format";
import { consumeLabel } from "./scan-copy";
import type { AddSource, SearchGroups, SearchViewProps } from "./types";

const DEBOUNCE_MS = 250;
const EMPTY: SearchGroups = { cellar: [], catalog: [], tasted: [] };
const EMPTY_HINT = "Search by producer, wine or appellation";

/**
 * 7e — search instead of scanning. One list, three groups in the handoff's
 * order (your cellar → the catalog → wines you have tasted), every row adds
 * on tap through `onAdd`. The shell draws the ✕ / title header above this
 * view; this file owns the search row, the grouped list and the "Add it by
 * hand" footer.
 *
 * The shell keeps this view mounted (parked with `hidden`) so the field
 * exists before "Or search by name" is tapped and can be focused inside that
 * tap — there is no autofocus here on purpose (CLAUDE.md's combobox rule).
 */
export function SearchView({
  ctx,
  onAdd,
  onScan,
  onByHand,
  busy,
  inputRef,
  hidden = false,
}: SearchViewProps) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  // Results are stored WITH the query they answer, so "searching" is derived
  // (results lag the query) rather than a flag that can go stale on a race.
  const [results, setResults] = useState<{ query: string; groups: SearchGroups } | null>(null);
  const [failed, setFailed] = useState(false);
  // Drawn down by default — the same default as the 7f cellar view and the
  // desktop rows, so a lot tapped from search behaves like one tapped anywhere.
  const [consume, setConsume] = useState(true);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  const q = query.trim();
  const destKind = ctx.destination?.kind ?? null;
  // Taste & rate: a tap picks the wine whose note opens — nothing is added.
  const rate = destKind === "rate";
  // "In flight" is judged against the flight destination — or, with no
  // destination, tonight's tasting, which is where the shell drops a lot. A
  // rate pick pours into nothing, so it checks no tasting at all.
  const tastingId =
    ctx.destination?.kind === "flight"
      ? ctx.destination.tastingId
      : rate
        ? undefined
        : ctx.flightHint?.tastingId;
  // The view is long-lived, so a return to it (or an add made meanwhile)
  // re-runs the search: the "in flight" flags are only as fresh as the fetch.
  const addedCount = ctx.added.length;

  useEffect(() => {
    if (!q || hidden) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchAddWine(q, { tastingId })
        .then((groups) => {
          if (cancelled) return;
          setFailed(false);
          setResults({ query: q, groups });
        })
        .catch(() => {
          if (cancelled) return;
          setFailed(true);
          setResults({ query: q, groups: EMPTY });
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, tastingId, hidden, addedCount]);

  const groups = q && results?.query === q ? results.groups : null;
  const searching = Boolean(q) && !groups;

  // A cellar bottle is already in the cellar — the group is pointless there.
  const showCellar = destKind !== "cellar";
  const cellar = showCellar && groups ? groups.cellar : [];
  const catalog = groups?.catalog ?? [];
  const tasted = groups?.tasted ?? [];
  const found = cellar.length + catalog.length + tasted.length;
  // The tasted group carries no flight flag of its own; the catalog group
  // lists every visible hit, so its flags cover the same wines.
  const inFlightIds = new Set(catalog.filter((r) => r.inFlight).map((r) => r.catalogWineId));
  const pourable = cellar.filter((r) => r.drinkNow).reduce((sum, r) => sum + r.quantity, 0);
  const consumeApplies = showCellar && destKind !== "catalog";

  // Scan controls are touch-only (the device rule in use-camera.ts): the
  // shell sets `ctx.isDesktop` on a mouse / trackpad device, which never
  // shows this view anyway. On touch, the shell's header carries the Scan
  // pill whenever a camera exists (add-wine-sheet.tsx); this one fills the
  // remaining case — a touch device with no getUserMedia, where the camera
  // view still offers Library. If the shell's pill is ever removed, this
  // becomes `!ctx.isDesktop`.
  const showScan = !ctx.isDesktop && !ctx.hasCamera;

  const add = async (key: string, source: AddSource) => {
    if (busy || addingKey) return;
    setAddingKey(key);
    try {
      await onAdd(source);
    } finally {
      setAddingKey(null);
    }
  };

  // The lot carries its catalog wine so a rate pick needs no lookup.
  const cellarSource = (row: SearchGroups["cellar"][number]): AddSource =>
    destKind === "catalog"
      ? { kind: "catalog", catalogWineId: row.catalogWineId }
      : { kind: "lot", lotId: row.lotId, consume, catalogWineId: row.catalogWineId };

  const pending = busy || addingKey !== null;

  return (
    <div className="flex min-h-full flex-col">
      {/* Search row — stays put while the list scrolls under it. */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-[9px] bg-card p-[11px_16px] md:px-[22px]">
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-[9px] rounded-[11px] border-[1.5px] border-primary bg-white px-[13px]">
          <label htmlFor={inputId} className="flex shrink-0 items-center">
            <Search className="size-4 text-primary" aria-hidden />
            <span className="sr-only">Search wines</span>
          </label>
          <Input
            ref={inputRef}
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={EMPTY_HINT}
            autoComplete="off"
            enterKeyHint="search"
            className="h-auto flex-1 rounded-none border-0 bg-transparent px-0 py-[9px] text-base shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-[15px]"
          />
          {q ? (
            <span className="shrink-0 text-[11.5px] text-muted-foreground" aria-live="polite">
              {searching ? "Searching…" : `${found} found`}
            </span>
          ) : null}
        </div>
        {showScan ? (
          <button
            type="button"
            onClick={onScan}
            className="flex min-h-11 shrink-0 items-center gap-[6px] rounded-[8px] border border-border bg-background px-[11px] text-[11.5px] font-semibold text-primary transition-colors md:hover:border-gold md:hover:bg-white"
          >
            <Camera className="size-[14px]" aria-hidden />
            Scan
          </button>
        ) : null}
      </div>

      {/* The list */}
      {!q ? (
        <Centered>{EMPTY_HINT}</Centered>
      ) : searching ? (
        <Centered>
          <WineGlassLoader className="text-primary" />
          <span>Searching…</span>
        </Centered>
      ) : found === 0 ? (
        <Centered>
          <span>No matches</span>
          {failed ? <span>Couldn&rsquo;t search right now — try again.</span> : null}
        </Centered>
      ) : (
        <div className="flex flex-col">
          {cellar.length > 0 ? (
            <section>
              <GroupHeader
                title="In your cellar"
                note={pourable > 0 ? `${bottlesLabel(pourable)} you can pour tonight` : undefined}
              />
              {consumeApplies ? (
                <ConsumeCheckbox
                  variant="inline"
                  checked={consume}
                  onChange={setConsume}
                  disabled={pending}
                  label={consumeLabel(ctx.destination)}
                />
              ) : null}
              {cellar.map((row) => (
                <ResultRow
                  key={row.lotId}
                  title={row.title}
                  meta={searchCellarMeta(row)}
                  imageUrl={row.imageUrl}
                  pick={rate}
                  inFlight={row.inFlight}
                  pending={addingKey === `lot:${row.lotId}`}
                  disabled={pending}
                  onClick={() => void add(`lot:${row.lotId}`, cellarSource(row))}
                />
              ))}
            </section>
          ) : null}
          {catalog.length > 0 ? (
            <section>
              <GroupHeader title="In the catalog" />
              {catalog.map((row) => (
                <ResultRow
                  key={row.catalogWineId}
                  title={row.title}
                  meta={catalogMeta(row)}
                  imageUrl={row.imageUrl}
                  pick={rate}
                  inFlight={row.inFlight}
                  pending={addingKey === `catalog:${row.catalogWineId}`}
                  disabled={pending}
                  onClick={() =>
                    void add(`catalog:${row.catalogWineId}`, {
                      kind: "catalog",
                      catalogWineId: row.catalogWineId,
                    })
                  }
                />
              ))}
            </section>
          ) : null}
          {tasted.length > 0 ? (
            <section>
              <GroupHeader title="You have tasted before" />
              {tasted.map((row) => (
                <ResultRow
                  key={row.catalogWineId}
                  title={row.title}
                  meta={tastedMeta(row)}
                  imageUrl={row.imageUrl}
                  pick={rate}
                  inFlight={inFlightIds.has(row.catalogWineId)}
                  pending={addingKey === `tasted:${row.catalogWineId}`}
                  disabled={pending}
                  onClick={() =>
                    void add(`tasted:${row.catalogWineId}`, {
                      kind: "catalog",
                      catalogWineId: row.catalogWineId,
                    })
                  }
                />
              ))}
            </section>
          ) : null}
        </div>
      )}

      {/* Footer — pinned to the bottom of the sheet's scroll region. */}
      <div className="sticky bottom-0 z-10 mt-auto flex shrink-0 items-center gap-[10px] border-t border-border bg-background p-[11px_16px] pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-[11px] md:px-[22px]">
        <span className="flex-1 text-[12.5px] text-muted-foreground">Nothing matches?</span>
        <button
          type="button"
          disabled={pending}
          onClick={onByHand}
          className={actionButtonClass(
            "outline",
            "w-auto px-[18px] py-[12px] text-[14px] disabled:opacity-60 max-md:rounded-[10px] max-md:py-[12px]",
          )}
        >
          Add it by hand
        </button>
      </div>
    </div>
  );
}

function GroupHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-center gap-2 border-y border-border-light bg-background p-[9px_16px_6px] md:px-[22px]">
      <Eyebrow size="sm">{title}</Eyebrow>
      {note ? <span className="text-[11px] text-muted-foreground">{note}</span> : null}
    </div>
  );
}

// One result: 28×38 thumb, title, meta, and the trailing disc — the same
// gold-outlined "+" on every row, a chevron instead for a rate pick (which
// adds nothing). Owner feedback 2026-09-12: the handoff's filled bordeaux
// disc and gold tint on the first cellar row read as a different action, and
// this view has no ↵ shortcut for a marked row to stand for. A wine already
// in the flight is not tappable and reads "In flight".
function ResultRow({
  title,
  meta,
  imageUrl,
  pick = false,
  inFlight,
  pending,
  disabled,
  onClick,
}: {
  title: string;
  meta: string;
  imageUrl: string | null;
  /** Rate destination: the tap picks the wine for its note. */
  pick?: boolean;
  inFlight: boolean;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={inFlight || disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-[11px] border-b border-border-light p-[12px_16px] text-left transition-colors md:px-[22px]",
        !inFlight && "md:hover:bg-background",
        inFlight && "cursor-default",
      )}
    >
      <HatchThumb src={imageUrl} width={28} height={38} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-[14.5px] font-semibold leading-[1.25] text-foreground">
          {title}
        </span>
        <span className="truncate text-[11.5px] text-muted-foreground">{meta}</span>
      </span>
      {inFlight ? (
        <span className="shrink-0 text-[11.5px] text-muted-foreground">In flight</span>
      ) : (
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-gold text-primary"
        >
          {pending ? (
            <WineGlassLoader size={16} />
          ) : pick ? (
            <ChevronRight className="size-4" strokeWidth={2.5} />
          ) : (
            <Plus className="size-4" strokeWidth={2.5} />
          )}
        </span>
      )}
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}
