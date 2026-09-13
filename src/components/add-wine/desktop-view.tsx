"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Check, Search, Upload, X } from "lucide-react";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { cn } from "@/lib/utils";
import { SkippedLotNotice } from "./cellar-lot-step";
import { ConsumeCheckbox } from "./cellar-view";
import {
  catalogRowMeta,
  clampFocus,
  effectiveFocus,
  flattenSearchGroups,
  focusAnchorAt,
  lotPreviewChips,
  pickImageFiles,
  resolveFocusAnchor,
  type FocusAnchor,
} from "./desktop-format";
import { itemRowCopy, type ItemRowCopy, type ScanItem } from "./sheet-state";
import type { DesktopViewProps } from "./types";

type ItemAction = ItemRowCopy["actions"][number];

function catalogHref(catalogWineId: string): string {
  return `/catalog/${encodeURIComponent(catalogWineId)}`;
}

/**
 * A8 · B1 · C1 · D1 — the sheet on a device that cannot scan (D5), at any
 * window width: below `md` the upload zone and the tiles stack, and below `sm`
 * a result row moves its button to a second line. Every destination rule and
 * string comes from `matrix`; this view never tests the destination.
 *
 * - Search leads: the matrix's lead line when it has one, a full-width field,
 *   and one list whose rows state their source ("In your cellar · …",
 *   "Catalog · …", "You rated it …", or D1's "Already in the catalog · …"
 *   compared with the latest draft). Every row carries the same outlined
 *   `RowActionButton`, labelled by `matrix.row`: "+1 bottle" or "Open" only
 *   where the action itself changes (D9), "In flight" on a disabled row.
 * - Keyboard: ↑/↓ move the focused row without wrapping; the focused row gets
 *   the gold border and the ↵ mark, and Enter acts on it — by default the
 *   first addable row. ↑/↓ and an add pin the focus to that row for the query,
 *   by identity rather than index. The refetch after an add can reorder the
 *   list or drop the row just added (a lot whose last bottle was poured), so
 *   the focus follows the row, then its wine, and otherwise rests on no row
 *   until ↑/↓. A row just added therefore keeps the focus once it reads
 *   "In flight", and a second Enter does nothing (spec §C.4 rule 11); a new
 *   query drops the pin. With no destination every row's action is the
 *   chooser, so Enter never pours a lot (sources-2).
 * - Below the results: the upload zone (`matrix.upload`; each photo is read
 *   and matched as it is on the phone, one photo for a note) beside "From my
 *   cellar", "Add it by hand" and, for the cellar, the lot step's preview.
 * - Above the footer: this session's bottles as the light A4 rows
 *   (`itemRowCopy`). The footer carries the consume checkbox whenever lot rows
 *   are listed (D11), then the matrix's sentence and Done or Close. Adding
 *   never closes the sheet.
 *
 * The shell holds the query, the focused row and consume in sheet state and
 * runs the search, so leaving this view loses nothing (RC8). The pin is this
 * view's own state, and the stored row follows it (-1 once its wine has left
 * the list): leaving through a tile, a photo or a row's action stores the
 * focused row first, and mounting on a query already typed pins the stored
 * row in the groups at hand (no row while there are none). There is no
 * autofocus here on purpose: the shell focuses `inputRef` inside the tap that
 * lands here.
 */
export function DesktopView({
  matrix,
  destination,
  query,
  onQuery,
  inputRef,
  groups,
  loading,
  focusedRow,
  onFocusRow,
  consume,
  onConsume,
  items,
  draftForMeta,
  cellarSummary,
  lastRack,
  addedCount,
  onRow,
  onFiles,
  onCellarTile,
  onByHand,
  onNeither,
  onItemAction,
  onFooterButton,
  busy = false,
  error = null,
  skippedLot = null,
  onSkippedOpen,
}: DesktopViewProps) {
  const listId = useId();
  // The row whose add is running shows its loader until `busy` settles.
  const [tappedKey, setTappedKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [skippedFiles, setSkippedFiles] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

  const q = query.trim();
  const searching = loading || !groups;
  const includeCellar = matrix.searchGroups.includes("cellar");
  // B1: where a lot row adds a bottle to its own lot, it is a wine you already own.
  const ownedLead = matrix.row({ source: "lot", inFlight: false, owned: true }).action === "plusOne";
  const rows = useMemo(
    () => (q && groups ? flattenSearchGroups(groups, { includeCellar, ownedLead }) : []),
    [q, groups, includeCellar, ownedLead],
  );
  // The focus pin: the row ↑/↓ or an add chose for this query, held by
  // identity, never by index (resolveFocusAnchor). The refetch after an add can
  // reorder the list or drop the row just poured, and an index would then hand
  // Enter to another wine. Mounting on a query already typed (coming back to
  // this view) pins the stored row in the rows at hand, or no row without any.
  const [focusPin, setFocusPin] = useState<{ query: string; anchor: FocusAnchor | null } | null>(() =>
    q ? { query, anchor: focusAnchorAt(rows, focusedRow) } : null,
  );
  const cells = rows.map((row) =>
    matrix.row({ source: row.listedAs, inFlight: row.inFlight, owned: row.source.kind === "lot" }),
  );
  const pinned = focusPin?.query === query ? focusPin : null;
  const focus = pinned ? resolveFocusAnchor(pinned.anchor, rows) : effectiveFocus(focusedRow, cells);
  const lotsListed = rows.some((row) => row.source.kind === "lot");
  const footerLine = matrix.footer.sentence(addedCount);
  // C1 words its lead line and its footer alike: say it once, at the foot.
  const leadLine = matrix.leadLine && matrix.leadLine !== footerLine ? matrix.leadLine : null;

  // The shell's stored row follows the pinned row as the list changes, and is
  // -1 once its wine has left, so a view mounted again pins that same row.
  useEffect(() => {
    if (pinned && focus !== focusedRow) onFocusRow(focus);
  }, [pinned, focus, focusedRow, onFocusRow]);

  // Pin the focus to the row at `index` for this query; no row, no pin.
  const pin = (index: number) => {
    const anchor = focusAnchorAt(rows, index);
    if (!anchor) return;
    setFocusPin({ query, anchor });
    if (index !== focusedRow) onFocusRow(index);
  };
  // Before leaving for another view: coming back finds the same row focused.
  const keepFocus = () => pin(focus);

  const act = (index: number) => {
    const row = rows[index];
    const cell = cells[index];
    if (!row || !cell || cell.disabled || busy) return;
    // The row acted on keeps the focus once the add disables it, and after the
    // refetch moves or drops it, so a second Enter does nothing (spec §C.4
    // rule 11) instead of pouring the next hit.
    pin(index);
    if (cell.action === "open") {
      // Enter follows the row's own Link, which reports the open as it navigates.
      rowRefs.current[index]?.querySelector<HTMLAnchorElement>("a[href]")?.click();
      return;
    }
    setTappedKey(row.key);
    onRow(row, cell.action);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (rows.length === 0) return;
      e.preventDefault();
      const next = clampFocus(focus + (e.key === "ArrowDown" ? 1 : -1), rows.length);
      pin(next);
      rowRefs.current[next]?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    // While a search runs the rows on screen may answer the previous query.
    if (!loading) act(focus);
  };

  // --- the upload zone -------------------------------------------------------

  const takeFiles = (files: File[]) => {
    if (busy) return;
    const { accepted, skipped } = pickImageFiles(files, {
      max: matrix.upload.multiple ? undefined : 1,
    });
    setSkippedFiles(
      skipped.length
        ? `Skipped ${skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}.`
        : null,
    );
    if (accepted.length) {
      keepFocus();
      onFiles(accepted);
    }
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

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-4 p-4 md:p-[18px_22px]">
        {/* Search leads. */}
        <div className="flex flex-col gap-[6px]">
          {leadLine ? <p className="text-[12px] font-semibold">{leadLine}</p> : null}
          <label className="flex items-center gap-[10px] rounded-[11px] border-[1.5px] border-primary bg-surface-raised p-[13px_14px] focus-within:ring-3 focus-within:ring-ring/40">
            <Search className="size-[17px] shrink-0 text-primary" aria-hidden />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                // A new query drops the pin and resets the stored row to 0:
                // the default again.
                setFocusPin(null);
                onQuery(e.target.value);
              }}
              onKeyDown={onKeyDown}
              placeholder={matrix.searchPlaceholder}
              aria-label="Search for a wine"
              aria-controls={q && rows.length > 0 ? listId : undefined}
              autoComplete="off"
              spellCheck={false}
              className="h-auto flex-1 rounded-none border-0 bg-transparent p-0 text-[15.5px] shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-[15.5px]"
            />
            <span className="ml-auto flex shrink-0 items-center gap-[10px] font-mono text-[10.5px] text-muted-foreground">
              {q ? (
                <span aria-live="polite">{searching ? "Searching…" : matrix.resultCount(rows.length)}</span>
              ) : null}
              {/* In a narrow window the hint gives its room to the field. */}
              <span className="hidden sm:inline">{matrix.enterHint}</span>
            </span>
          </label>
        </div>

        {q ? (
          <div className="overflow-hidden rounded-[12px] border border-border bg-surface-raised">
            {rows.length > 0 ? (
              <ul id={listId} aria-label="Search results">
                {rows.map((row, i) => {
                  const cell = cells[i];
                  const focused = i === focus;
                  const open = cell.action === "open";
                  return (
                    <li
                      key={row.key}
                      ref={(el) => {
                        rowRefs.current[i] = el;
                      }}
                      aria-current={focused ? "true" : undefined}
                      className={cn(
                        // Below `sm` the button wraps to a second line under
                        // the title, so a long title is never crushed.
                        "flex items-center gap-3 p-[11px_14px] transition-colors max-sm:flex-wrap max-sm:gap-y-2",
                        i > 0 && "border-t border-border-light",
                        // Focus is a border and the ↵ mark, never a different
                        // button (B3).
                        focused ? "border-l-[3px] border-l-gold bg-gold/12 pl-[11px]" : "hover:bg-background",
                        cell.disabled && "opacity-70",
                      )}
                    >
                      <HatchThumb src={row.imageUrl} width={30} height={40} />
                      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                        <span className="truncate font-heading text-[16px] font-semibold leading-[1.15]">
                          {row.title}
                        </span>
                        <span className="truncate text-[11.5px] text-muted-foreground">
                          {open && row.identity ? catalogRowMeta(row.identity, draftForMeta) : row.meta}
                        </span>
                      </span>
                      {/* 42px = the thumb and its gap: the second line starts
                          under the title. */}
                      <span className="flex shrink-0 items-center justify-end gap-[10px] max-sm:w-full max-sm:pl-[42px]">
                        {focused ? (
                          <span aria-hidden className="font-mono text-[10.5px] text-muted-foreground">
                            ↵
                          </span>
                        ) : null}
                        <RowActionButton
                          label={cell.label}
                          wineTitle={row.title}
                          inFlight={cell.disabled}
                          pending={busy && tappedKey === row.key}
                          disabled={busy}
                          href={open ? catalogHref(row.catalogWineId) : undefined}
                          onClick={open ? () => onRow(row, "open") : () => act(i)}
                        />
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="p-[13px_14px] text-[12.5px] text-muted-foreground">
                {searching
                  ? "Searching…"
                  : `Nothing matches “${q}” — upload a label photo or add it by hand.`}
              </p>
            )}
          </div>
        ) : null}

        {q && groups && matrix.neitherOfThese ? (
          <Tile
            title="Neither of these"
            subtitle="Continue and create a new entry"
            onClick={() => {
              keepFocus();
              onNeither();
            }}
            disabled={busy}
          />
        ) : null}

        {skippedLot ? <SkippedLotNotice lotId={skippedLot.lotId} onOpen={onSkippedOpen} /> : null}

        {/* The upload zone beside the tiles — stacked below `md`. */}
        <div className="flex flex-col gap-3 md:flex-row">
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
              {matrix.upload.title}
            </span>
            <span className="text-[12px] leading-[1.5] text-ink-photo">{matrix.upload.body}</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple={matrix.upload.multiple}
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
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="flex min-h-11 items-center gap-[11px] self-stretch rounded-[10px] border border-border bg-card p-[14px] text-left transition-colors hover:border-gold disabled:opacity-60"
            >
              <HatchThumb src={null} width={34} height={44} />
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="text-[12.5px] font-semibold">{matrix.upload.drop}</span>
                <span className="text-[11.5px] text-muted-foreground">{matrix.upload.choose}</span>
              </span>
            </button>
            {skippedFiles ? (
              <span role="status" className="text-[11.5px] text-rose">
                {skippedFiles}
              </span>
            ) : null}
          </div>

          <div className="flex flex-1 flex-col gap-[10px]">
            {matrix.cellarSource ? (
              <Tile
                title="From my cellar"
                subtitle={matrix.cellarTileSubtitle?.(cellarSummary) ?? ""}
                onClick={() => {
                  keepFocus();
                  onCellarTile();
                }}
                disabled={busy}
              />
            ) : null}
            <Tile
              title="Add it by hand"
              subtitle={matrix.byHandTileSubtitle}
              onClick={() => {
                keepFocus();
                onByHand();
              }}
              disabled={busy}
            />
            {matrix.lotPreviewTile ? <LotPreviewTile chips={lotPreviewChips(lastRack)} /> : null}
          </div>
        </div>

        {/* This session's bottles (A4, light tone). */}
        {items.length > 0 ? (
          <ul className="flex flex-col gap-[6px]" aria-label="Wines in this sheet">
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                copy={itemRowCopy(item, destination)}
                disabled={busy}
                onAction={(action) => {
                  keepFocus();
                  onItemAction(item.id, action);
                }}
              />
            ))}
          </ul>
        ) : null}
      </div>

      {/* Pinned to the bottom of the sheet's scroll region, so Done stays in
          reach under a long result list. */}
      <div className="sticky bottom-0 z-10 mt-auto flex shrink-0 flex-col gap-[10px] border-t border-border bg-background p-[14px_16px] pb-[max(14px,env(safe-area-inset-bottom))] md:px-[22px]">
        {lotsListed && matrix.consumeLabel ? (
          <ConsumeCheckbox
            checked={consume}
            onChange={onConsume}
            disabled={busy}
            label={matrix.consumeLabel}
          />
        ) : null}
        {error ? (
          <p role="alert" className="text-[12.5px] text-rose">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <span className="min-w-0 text-[12.5px] leading-[1.5] text-muted-foreground">
            {footerLine}
          </span>
          <button
            type="button"
            onClick={onFooterButton}
            disabled={busy}
            className="ml-auto min-h-11 shrink-0 rounded-[9px] border border-border bg-card px-[18px] py-[10px] text-[13.5px] font-semibold transition-colors hover:border-gold hover:bg-surface-raised disabled:opacity-60"
          >
            {matrix.footer.button}
          </button>
        </div>
      </div>
    </div>
  );
}

// A white face, so the button reads the same on the focused row's tint as on a
// plain or hovered one. Shared by the button and its link variant.
const ROW_ACTION_CLASS =
  "flex min-h-[36px] shrink-0 items-center gap-[7px] rounded-[8px] border border-border bg-surface-raised px-[14px] py-2 text-[12.5px] font-semibold text-primary transition-colors hover:border-gold";

/**
 * A result row's inline action — one button for every row of every add-wine
 * result list (owner feedback 2026-09-12): the outline style with the label
 * the matrix gives the row, and "In flight", disabled, on a wine already
 * poured. Nothing about it marks the focused row; that row's border does.
 * Exported so the create sheet's flight step renders the very same button.
 * With every visible label alike, the accessible name adds the wine.
 *
 * `href` (D1 "Open"): a Next `Link` with exactly the button's classes, so a
 * catalog hit still carries the same button.
 */
export function RowActionButton({
  label,
  wineTitle,
  inFlight,
  pending,
  disabled,
  onClick,
  href,
}: {
  label: string;
  wineTitle: string;
  inFlight: boolean;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
  href?: string;
}) {
  const name = `${label}: ${wineTitle}`;
  if (href !== undefined) {
    return (
      <Link
        href={href}
        aria-label={name}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        onClick={(e) => {
          if (disabled) {
            e.preventDefault();
            return;
          }
          onClick();
        }}
        className={cn(ROW_ACTION_CLASS, disabled && "pointer-events-none opacity-60")}
      >
        {label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled || inFlight}
      onClick={onClick}
      aria-label={name}
      className={cn(
        ROW_ACTION_CLASS,
        "disabled:cursor-default disabled:hover:border-border",
        inFlight ? "opacity-70" : "disabled:opacity-60",
      )}
    >
      {pending ? <WineGlassLoader size={16} /> : null}
      {label}
    </button>
  );
}

// A source tile: title + caption, gold border and lift on hover.
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
      className="flex min-h-11 flex-1 flex-col justify-center gap-1 rounded-[12px] border border-border bg-surface-raised p-[14px] text-left transition-[border-color,box-shadow] hover:border-gold hover:shadow-[0_6px_14px_-8px_rgba(42,33,30,.5)] disabled:opacity-60"
    >
      <span className="text-[14px] font-semibold">{title}</span>
      <span className="text-[12px] text-muted-foreground">{subtitle}</span>
    </button>
  );
}

// B1: what the lot step asks next, with its defaults as chips. Not a control.
function LotPreviewTile({ chips }: { chips: string[] }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-[6px] rounded-[12px] border border-gold bg-background p-[14px]">
      <span className="text-[14px] font-semibold">Then: quantity, rack, price</span>
      <span className="flex flex-wrap gap-[6px]">
        {chips.map((chip, i) => (
          <span
            key={chip}
            className={cn(
              "rounded-[7px] border border-border bg-card px-[10px] py-[5px] text-[11.5px]",
              // The price is optional: its chip is the quiet one.
              i === chips.length - 1 ? "text-muted-foreground" : "font-semibold",
            )}
          >
            {chip}
          </span>
        ))}
      </span>
    </div>
  );
}

/**
 * One A4 row in the light tone — the laptop twin of the multi stack's rows
 * (multi-add-stack.tsx), from the same `itemRowCopy`:
 * - added: a gold ✓, the label and where it went ("glass N");
 * - incomplete or pending: "!", "{title} · {what did not read}" and a bordered
 *   Fix; pending rows also get a remove ✕;
 * - failed: "Couldn't read this photo" · Retry · Remove;
 * - uploading or reading: the photo's thumbnail and "Reading the label…".
 */
function ItemRow({
  item,
  copy,
  disabled,
  onAction,
}: {
  item: ScanItem;
  copy: ItemRowCopy;
  disabled: boolean;
  onAction: (action: ItemAction) => void;
}) {
  const row = "flex items-center gap-[10px] rounded-[10px] border p-[9px_12px]";

  if (copy.tone === "added") {
    return (
      <li className={cn(row, "border-border-light bg-background")}>
        <span
          aria-hidden
          className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-gold text-foreground"
        >
          <Check className="size-[11px]" strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px]">{copy.label}</span>
        {copy.detail ? (
          <span className="shrink-0 text-[11px] text-muted-foreground">{copy.detail}</span>
        ) : null}
      </li>
    );
  }

  if (copy.tone === "reading") {
    return (
      <li role="status" className={cn(row, "border-border-light bg-background")}>
        {/* A local blob URL — next/image cannot optimise it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.photoUrl}
          alt=""
          className="h-8 w-6 shrink-0 rounded-[4px] border border-border object-cover"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{copy.label}</span>
      </li>
    );
  }

  // incomplete, pending and failed: something still needs the user.
  const { head, gap } = splitGap(copy.label);
  return (
    <li className={cn(row, "border-rose/40 bg-rose/10")}>
      <span
        aria-hidden
        className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-rose text-[10px] font-bold text-rose"
      >
        !
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="line-clamp-2 text-[13px]">
          {head}
          {gap ? <span className="text-rose"> · {gap}</span> : null}
        </span>
        {copy.detail ? (
          <span role="alert" className="text-[11px] text-rose">
            {copy.detail}
          </span>
        ) : null}
      </span>
      {copy.actions.map((action) => (
        <ItemActionButton
          key={action}
          action={action}
          textRemove={copy.tone === "failed"}
          label={copy.label}
          disabled={disabled}
          onClick={() => onAction(action)}
        />
      ))}
    </li>
  );
}

/** "Cigliuti, Barbaresco · no vintage read" → the title, and the part that is
    tinted: only a trailing describeUnread phrase ("no … read"). */
function splitGap(label: string): { head: string; gap: string | null } {
  const at = label.lastIndexOf(" · ");
  if (at < 0) return { head: label, gap: null };
  const tail = label.slice(at + 3);
  return /^no .+ read$/.test(tail) ? { head: label.slice(0, at), gap: tail } : { head: label, gap: null };
}

// Fix and Retry are bordered; a pending row's remove is a ✕, a failed row's a
// word ("Retry" · "Remove"). Pseudo-elements pad each target to 44px tall
// without growing the row — the laptop view also serves touch devices that
// cannot scan.
function ItemActionButton({
  action,
  textRemove,
  label,
  disabled,
  onClick,
}: {
  action: ItemAction;
  textRemove: boolean;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  if (action === "remove" && !textRemove) {
    return (
      <Button
        type="button"
        variant="ghost"
        aria-label={`Remove ${label}`}
        disabled={disabled}
        onClick={onClick}
        className="relative size-6 shrink-0 rounded-full p-0 text-muted-foreground after:absolute after:-inset-x-[5px] after:-inset-y-[10px] after:content-[''] hover:bg-transparent hover:text-foreground"
      >
        <X aria-hidden className="size-[13px]" />
      </Button>
    );
  }
  if (action === "remove") {
    return (
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={onClick}
        className="relative h-7 shrink-0 rounded-[7px] px-[6px] text-[11.5px] font-semibold text-muted-foreground after:absolute after:-inset-x-1 after:-inset-y-2 after:content-[''] hover:bg-transparent hover:text-foreground"
      >
        Remove
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className="relative h-7 shrink-0 rounded-[7px] border-primary bg-transparent px-[11px] text-[11.5px] font-bold text-primary after:absolute after:-inset-x-1 after:-inset-y-2 after:content-[''] hover:bg-gold/15 hover:text-primary"
    >
      {action === "fix" ? "Fix" : "Retry"}
    </Button>
  );
}
