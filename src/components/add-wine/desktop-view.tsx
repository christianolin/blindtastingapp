"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { Check, Search, Upload } from "lucide-react";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { Input } from "@/components/ui/input";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { cn } from "@/lib/utils";
import { searchAddWine } from "./actions";
import { getCellarSummary } from "./desktop-actions";
import {
  cellarTileSubtitle,
  flattenSearchGroups,
  footerSentence,
  pickImageFiles,
  rowActionLabel,
  uploadZoneCopy,
  type CellarSummary,
  type DesktopRow,
} from "./desktop-format";
import { scanTitle } from "./format";
import { addedWhere, pendingProblemLabel } from "./scan-copy";
import type { AddSource, DesktopViewProps, SearchGroups } from "./types";

const DEBOUNCE_MS = 250;
const SEARCH_FAILED = "Search failed — try again.";

/**
 * 7h: the sheet on a laptop. Search leads — a full-width field where ↵ adds
 * the first hit, and result rows that state their source with an inline
 * "Add as glass N" (first addable row primary, the rest "Add"). Below it the
 * dashed "Upload label photos" zone (drag-and-drop or a file picker, several
 * at once; each file goes through the shell's read-and-confirm path, one
 * FastCork credit per photo) beside the "From my cellar" and "Add it by hand"
 * tiles. The sheet stays open after every add; the footer says so and
 * carries the single Done.
 *
 * Cellar rows add as `{ kind: "lot", consume: true }` — the bottle is drawn
 * down when poured — with a per-row "keep it in the cellar" toggle. They
 * are offered only when the bottle can go into a flight (the flight
 * destination, or none with tonight's tasting as the hint).
 */
export function DesktopView({
  ctx,
  onAdd,
  onFiles,
  onCellar,
  onByHand,
  onDone,
  busy,
}: DesktopViewProps) {
  const destination = ctx.destination;
  const tastingId = destination?.kind === "flight" ? destination.tastingId : undefined;
  const includeCellar =
    destination?.kind === "flight" || (destination === null && ctx.flightHint !== null);

  const [query, setQuery] = useState("");
  // null = nothing searched yet (the results box is hidden).
  const [groups, setGroups] = useState<SearchGroups | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [keepInCellar, setKeepInCellar] = useState<Record<string, boolean>>({});
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [summary, setSummary] = useState<CellarSummary | null>(null);
  const [dragging, setDragging] = useState(false);
  const [skippedNote, setSkippedNote] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  // What the field says right now — the post-add re-search must not use a
  // handler's stale copy if the user kept typing while the add ran.
  const queryRef = useRef("");
  // Only the newest search may write its results (a slow earlier response
  // must not overwrite a faster later one).
  const nonceRef = useRef(0);

  const runSearch = useCallback(
    async (raw: string) => {
      const nonce = ++nonceRef.current;
      const q = raw.trim();
      if (!q) {
        setGroups(null);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const r = await searchAddWine(q, { tastingId });
        if (nonce !== nonceRef.current) return;
        setGroups(r);
        setSearchError(null);
      } catch {
        if (nonce !== nonceRef.current) return;
        setGroups({ cellar: [], catalog: [], tasted: [] });
        setSearchError(SEARCH_FAILED);
      } finally {
        if (nonce === nonceRef.current) setSearching(false);
      }
    },
    [tastingId],
  );

  const onQueryChange = (value: string) => {
    setQuery(value);
    queryRef.current = value;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (!value.trim()) {
      nonceRef.current += 1;
      setGroups(null);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    timerRef.current = window.setTimeout(() => void runSearch(value), DEBOUNCE_MS);
  };

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  // The cellar tile's counts — only when the tile is shown.
  useEffect(() => {
    if (!includeCellar) return;
    let cancelled = false;
    getCellarSummary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [includeCellar]);

  const rows = useMemo(
    () => (groups ? flattenSearchGroups(groups, { includeCellar }) : []),
    [groups, includeCellar],
  );
  const firstAddable = rows.find((r) => !r.inFlight) ?? null;
  const locked = busy || addingKey !== null;

  const addRow = async (row: DesktopRow) => {
    if (locked || row.inFlight) return;
    const source: AddSource =
      row.source.kind === "lot"
        ? { kind: "lot", lotId: row.source.lotId, consume: !keepInCellar[row.source.lotId] }
        : { kind: "catalog", catalogWineId: row.source.catalogWineId };
    setAddingKey(row.key);
    try {
      await onAdd(source);
    } finally {
      setAddingKey(null);
      // The results stay: re-read them so the wine just poured reads "in
      // flight" and ↵ moves on to the next hit.
      const latest = queryRef.current;
      if (latest.trim()) void runSearch(latest);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (firstAddable) void addRow(firstAddable);
  };

  // --- the drop zone --------------------------------------------------------

  const takeFiles = (files: File[]) => {
    if (locked) return;
    const { accepted, skipped } = pickImageFiles(files);
    setSkippedNote(
      skipped.length
        ? `Skipped ${skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}.`
        : null,
    );
    if (accepted.length) onFiles(accepted);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!dragging) setDragging(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // Moving between the zone's own children fires leave/over pairs; only a
    // real exit clears the highlight.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    takeFiles(Array.from(e.dataTransfer.files));
  };

  const trimmed = query.trim();
  const showResults = trimmed.length > 0;
  const showCellarTile = includeCellar;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-4 p-[18px_22px]">
        {/* Search leads. */}
        <label className="flex items-center gap-[10px] rounded-[11px] border-[1.5px] border-primary bg-white p-[13px_14px] focus-within:ring-3 focus-within:ring-ring/40">
          <Search className="size-[17px] shrink-0 text-primary" aria-hidden />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search by producer, wine or appellation"
            aria-label="Search for a wine"
            autoComplete="off"
            spellCheck={false}
            className="h-auto flex-1 rounded-none border-0 bg-transparent p-0 text-[15.5px] shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-[15.5px]"
          />
          <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground">
            ↵ adds the first hit
          </span>
        </label>

        {showResults ? (
          <div className="overflow-hidden rounded-[12px] border border-border bg-white">
            <p role="status" className="sr-only">
              {searching ? "Searching" : `${rows.length} found`}
            </p>
            {rows.length > 0 ? (
              <ul>
                {rows.map((row, i) => {
                  const primary = firstAddable?.key === row.key;
                  const label = rowActionLabel(destination, { primary, inFlight: row.inFlight });
                  const adding = addingKey === row.key;
                  return (
                    <li
                      key={row.key}
                      className={cn(
                        "flex items-center gap-3 p-[11px_14px] transition-colors",
                        i > 0 && "border-t border-border-light",
                        primary
                          ? "border-l-[3px] border-l-gold bg-gold/12"
                          : "hover:bg-background",
                        row.inFlight && "opacity-70",
                      )}
                    >
                      <HatchThumb src={row.imageUrl} width={30} height={40} />
                      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                        <span className="truncate font-heading text-[16px] font-semibold leading-[1.15]">
                          {row.title}
                        </span>
                        <span className="truncate text-[11.5px] text-muted-foreground">
                          {row.meta}
                        </span>
                      </span>
                      {row.source.kind === "lot" && !row.inFlight ? (
                        <KeepToggle
                          lotId={row.source.lotId}
                          checked={Boolean(keepInCellar[row.source.lotId])}
                          disabled={locked}
                          onChange={(lotId, keep) =>
                            setKeepInCellar((m) => ({ ...m, [lotId]: keep }))
                          }
                        />
                      ) : null}
                      <button
                        type="button"
                        disabled={locked || row.inFlight}
                        onClick={() => void addRow(row)}
                        className={cn(
                          "flex min-h-[36px] shrink-0 items-center gap-[7px] rounded-[8px] px-[14px] py-2 text-[12.5px] font-semibold transition-colors disabled:cursor-default",
                          primary
                            ? "bg-primary text-primary-foreground hover:bg-[#4A1523] disabled:hover:bg-primary"
                            : "border border-border text-primary hover:border-gold hover:bg-white",
                          row.inFlight ? "opacity-70" : "disabled:opacity-60",
                        )}
                      >
                        {adding ? <WineGlassLoader size={16} /> : null}
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="p-[13px_14px] text-[12.5px] text-muted-foreground">
                {searching
                  ? "Searching…"
                  : (searchError ??
                    `Nothing matches “${trimmed}” — upload a label photo or add it by hand.`)}
              </p>
            )}
          </div>
        ) : null}

        {/* What this sheet has added, and any photo still waiting for a fix. */}
        {ctx.added.length > 0 || ctx.pending.length > 0 ? (
          <ul className="flex flex-col gap-[6px]">
            {ctx.added.map((a, i) => (
              <li
                key={a.wineId ?? a.lotId ?? `${a.catalogWineId}-${i}`}
                className="flex items-center gap-[10px] rounded-[10px] border border-border-light bg-background p-[9px_12px]"
              >
                <span
                  aria-hidden
                  className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-gold text-foreground"
                >
                  <Check className="size-[11px]" strokeWidth={3} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{a.label}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{addedWhere(a)}</span>
              </li>
            ))}
            {ctx.pending.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-[10px] rounded-[10px] border border-rose/40 bg-rose/10 p-[9px_12px]"
              >
                <span
                  aria-hidden
                  className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-rose text-[10px] font-bold text-rose"
                >
                  !
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {scanTitle(p.prefill)}{" "}
                  <span className="text-rose">· {pendingProblemLabel(p.problem)}</span>
                </span>
                <button
                  type="button"
                  disabled={locked}
                  onClick={onByHand}
                  className="shrink-0 text-[11.5px] font-semibold text-primary hover:text-gold-dark disabled:opacity-60"
                >
                  Add it by hand
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Upload zone beside the two tiles. */}
        <div className="flex gap-3">
          <div
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={cn(
              "flex flex-1 flex-col items-start gap-[9px] rounded-[12px] border border-dashed p-4 transition-colors",
              dragging ? "border-gold-deep bg-gold/15" : "border-gold bg-background",
            )}
          >
            <span className="flex items-center gap-2 text-[14px] font-semibold">
              <Upload className="size-[17px] text-primary" aria-hidden />
              Upload label photos
            </span>
            <span className="text-[12px] leading-[1.5] text-ink-photo">
              {uploadZoneCopy(destination)}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                // Picking the same files twice must still fire a change event.
                e.target.value = "";
                takeFiles(files);
              }}
            />
            <button
              type="button"
              disabled={locked}
              onClick={() => fileRef.current?.click()}
              className="flex min-h-11 items-center gap-[11px] self-stretch rounded-[10px] border border-border bg-card p-[14px] text-left transition-colors hover:border-gold disabled:opacity-60"
            >
              <HatchThumb src={null} width={34} height={44} />
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="text-[12.5px] font-semibold">Drop photos here</span>
                <span className="text-[11.5px] text-muted-foreground">
                  or choose files · JPG, PNG, up to 5MB each
                </span>
              </span>
            </button>
            {skippedNote ? (
              <span role="status" className="text-[11.5px] text-rose">
                {skippedNote}
              </span>
            ) : null}
          </div>

          <div className="flex flex-1 flex-col gap-[10px]">
            {showCellarTile ? (
              <Tile
                title="From my cellar"
                subtitle={cellarTileSubtitle(summary)}
                onClick={onCellar}
                disabled={locked}
              />
            ) : null}
            <Tile
              title="Add it by hand"
              subtitle="Producer, name, vintage, colour"
              onClick={onByHand}
              disabled={locked}
            />
          </div>
        </div>
      </div>

      {/* Footer: the sheet does not close on add. */}
      <div className="mt-auto flex shrink-0 items-center gap-3 border-t border-border bg-background p-[14px_22px]">
        <span className="text-[12.5px] text-muted-foreground">
          {footerSentence(destination, ctx.added.length)}
        </span>
        <button
          type="button"
          onClick={onDone}
          disabled={locked}
          className="ml-auto min-h-11 shrink-0 rounded-[9px] border border-border bg-card px-[18px] py-[10px] text-[13.5px] font-semibold transition-colors hover:border-gold hover:bg-white disabled:opacity-60"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// The per-row "keep it in the cellar" toggle: unchecked means the bottle is
// drawn down when poured (the 7f default), checked leaves the lot untouched.
function KeepToggle({
  lotId,
  checked,
  disabled,
  onChange,
}: {
  lotId: string;
  checked: boolean;
  disabled: boolean;
  onChange: (lotId: string, keep: boolean) => void;
}) {
  return (
    <label className="flex shrink-0 items-center gap-[5px] text-[11px] whitespace-nowrap text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(lotId, e.target.checked)}
        className="size-[13px] accent-primary"
      />
      keep it in the cellar
    </label>
  );
}

// A bottle tile: title + caption, gold border and lift on hover.
function Tile({
  title,
  subtitle,
  onClick,
  disabled,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 flex-1 flex-col justify-center gap-1 rounded-[12px] border border-border bg-white p-[14px] text-left transition-[border-color,box-shadow] hover:border-gold hover:shadow-[0_6px_14px_-8px_rgba(42,33,30,.5)] disabled:opacity-60"
    >
      <span className="text-[14px] font-semibold">{title}</span>
      <span className="text-[12px] text-muted-foreground">{subtitle}</span>
    </button>
  );
}
