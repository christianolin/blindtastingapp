"use client";

import type { ReactNode } from "react";
import { Check, ChevronRight, Pencil, RotateCcw, Search } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { cn } from "@/lib/utils";
import { missingWineFields } from "@/lib/wine-identity/complete";
import { describeMissing, describeUnread } from "@/lib/wine-identity/describe";
import type { CatalogMatch } from "@/lib/wine-identity/match";
import type { WineFieldKey, WineIdentityDraft } from "@/lib/wine-identity/types";
import { glassLabel } from "./format";
import { flightHintSubtitle } from "./matrix";
import { bottlesLabel } from "./row-format";
import { appellationSourceNote, readOkChip } from "./scan-copy";
import type { ChooserProps, ReadConfirmProps } from "./types";

const READING = "Reading the label…";
const FAILED = "Couldn't read this photo";
const WRONG_BOTTLE = "Wrong bottle?";

/**
 * A3 = D2b, plus the E1/E1b footer (spec §C.5): one read-and-confirm
 * component for every destination. The photo stays at the top; the parsed
 * identity, a completeness chip, at most one confident catalog match, the
 * three recovery buttons, the destination note and the destination footer sit
 * below it. With no destination the photo fills the view and the footer asks
 * "Where does it go?" instead (D12).
 *
 * Every string and rule that depends on the destination comes from `matrix`,
 * `flightHint` and `sourceIsLot`; the view never tests the destination's kind
 * (spec §G.1 gate 4). It performs no write: the shell decides what the primary
 * button adds (a match, the read's identity, an incomplete glass, or By hand
 * first) through `onPrimary`. Auto-add is never offered (D6, D15).
 */
export function ReadConfirm({
  item,
  matrix,
  destination,
  canScan,
  flightHint,
  cellarHint,
  sourceIsLot,
  busy,
  error,
  onPrimary,
  onScanNext,
  onFix,
  onByHand,
  onSearch,
  onRescan,
  onRetry,
  onRemove,
  onChoose,
}: ReadConfirmProps) {
  if (item.status === "uploading" || item.status === "reading") {
    return <ReadingView imageUrl={item.photoUrl} />;
  }
  if (item.status === "failed") {
    return <FailedRead imageUrl={item.photoUrl} busy={busy} onRetry={onRetry} onRemove={onRemove} />;
  }
  const read = item.read;
  // A read is always set once an item leaves reading; render the transient
  // state rather than an empty panel if the shell ever gets ahead of it.
  if (!read) return <ReadingView imageUrl={item.photoUrl} />;

  // Gaps come from the one completeness module: the sheet's draft once it
  // holds one (edits land there), otherwise the read's own list — exactly as
  // the stack's row copy counts them (itemRowCopy).
  const draft = item.draft ?? read.draft;
  const missing: readonly WineFieldKey[] = item.draft ? missingWineFields(item.draft) : read.missing;
  const match = read.match;
  // Owner fixes B and C (2026-09-19): an appellation the label did not print says
  // where it came from — other vintages, or the one follow-up lookup.
  const sourceNote = appellationSourceNote(draft);
  // scan-3: an unknown producer is named, and created only on the explicit add.
  const newProducer =
    read.display.newProducer && read.draft.producer ? `${read.draft.producer.name} · new producer` : null;
  const recovery = {
    disabled: busy,
    onRescan,
    onByHand,
    // D6: near matches are one search away.
    onSearch: () => onSearch(searchQueryFor(draft)),
  };

  if (destination === null) {
    // E1 / E1b: the identity, the recovery row (§2.1 row 6), then the chooser.
    // A match is headed by the read's own title and meta too: a confident match
    // agrees with the read on producer, cuvée and vintage (spec §B.6), while
    // `match.title` is only the card label "{appellation} {vintage}", which names
    // neither the producer nor the cuvée. The ✓ eyebrow is what marks the match.
    const title = read.display.title;
    const meta = read.display.meta;
    return (
      <div className="relative flex min-h-full flex-col text-primary-foreground">
        {/* A local blob URL — next/image cannot optimise it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.photoUrl}
          alt="The label you photographed"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-t from-console from-34% via-console/40 via-70% to-console/15"
        />

        <div className="relative mt-auto flex flex-col gap-[14px] px-4 pt-12 pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-[22px] md:px-[22px]">
          <div className="flex flex-col gap-[7px]">
            <Eyebrow
              size="md"
              className={cn("flex items-center gap-2", match ? "text-gold-light" : "text-console-ink")}
            >
              {match ? <CheckDisc tone="dark" /> : null}
              {match ? matrix.confirm.eyebrowMatch : matrix.confirm.eyebrowNoMatch}
            </Eyebrow>
            {title ? (
              <h3 className="font-heading text-[29px] font-semibold leading-[1.06]">{title}</h3>
            ) : null}
            {meta ? <p className="text-[12.5px] text-console-ink">{meta}</p> : null}
            {sourceNote ? <p className="text-[12px] text-console-ink/80">{sourceNote}</p> : null}
            {!match && newProducer ? (
              <p className="text-[12.5px] font-semibold text-gold-light">{newProducer}</p>
            ) : null}
            {missing.length > 0 ? (
              <div className="flex flex-wrap items-center gap-[10px] pt-[2px]">
                <span className="text-[13px] font-semibold text-gold-light">{describeMissing(missing)}</span>
                <FixButton tone="dark" disabled={busy} onClick={onFix} />
              </div>
            ) : null}
          </div>

          <RecoveryRow tone="dark" {...recovery} />

          {error ? (
            <p role="alert" className="text-[12.5px] text-miss">
              {error}
            </p>
          ) : null}

          <Chooser
            flightHint={flightHint}
            cellarHint={cellarHint}
            sourceIsLot={sourceIsLot}
            busy={busy}
            onChoose={onChoose}
          />
        </div>
      </div>
    );
  }

  const chip = missing.length > 0 ? null : readOkChip(read.confidence, draft);
  return (
    <div className="flex min-h-full flex-col">
      <PhotoBand imageUrl={item.photoUrl} />

      <div className="flex flex-1 flex-col rounded-t-[22px] bg-card text-foreground">
        <div className="flex flex-col gap-[9px] border-b border-border p-[12px_16px] md:px-[22px]">
          <span aria-hidden className="h-1 w-[38px] self-center rounded-full bg-border" />
          <div className="flex items-start gap-[10px]">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {read.display.title ? (
                <h3 className="font-heading text-[21px] font-semibold leading-[1.12]">{read.display.title}</h3>
              ) : null}
              {read.display.meta ? (
                <p className="text-[12px] text-muted-foreground">{read.display.meta}</p>
              ) : null}
              {sourceNote ? <p className="text-[11.5px] text-muted-foreground">{sourceNote}</p> : null}
              {newProducer ? <p className="text-[12px] font-semibold text-gold-dark">{newProducer}</p> : null}
            </div>
            {chip ? <ReadChip label={chip.label} tone={chip.tone} /> : null}
          </div>
          {missing.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <ReadChip label={describeUnread(missing).toUpperCase()} tone="gap" />
              <FixButton tone="light" disabled={busy} onClick={onFix} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-[10px] p-[12px_16px] md:px-[22px]">
          <Eyebrow size="sm">{match ? matrix.confirm.eyebrowMatch : matrix.confirm.eyebrowNoMatch}</Eyebrow>
          {match ? <MatchCard match={match} /> : null}

          <RecoveryRow tone="light" {...recovery} />

          {matrix.confirm.note ? (
            <p className="mt-auto rounded-[11px] border border-border bg-background p-[11px_13px] text-[12.5px] leading-[1.45] text-ink-photo">
              {matrix.confirm.note}
            </p>
          ) : null}
        </div>

        {/* Pinned to the bottom of the sheet's scroll region, like the other
            views' footers: on a small phone the panel outgrows the viewport. */}
        <div className="sticky bottom-0 z-10 mt-auto flex shrink-0 flex-col gap-2 border-t border-border bg-background px-4 pt-[11px] pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-4 md:px-[22px]">
          {error ? (
            <p role="alert" className="text-[12.5px] text-rose">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            disabled={busy}
            onClick={onPrimary}
            className="h-auto min-h-11 w-full gap-[9px] rounded-[11px] p-[15px] text-[16.5px] font-semibold whitespace-normal shadow-[0_2px_0_0_rgba(42,33,30,.18)]"
          >
            {busy ? <WineGlassLoader size={18} /> : null}
            {match ? matrix.confirm.primaryMatch : matrix.confirm.primaryNoMatch}
          </Button>
          {/* "Add and scan the next" keeps a camera going: the matrix offers it
              only where one exists (a flight on a device that can scan). */}
          {canScan && matrix.footer.secondary ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onScanNext}
              className="h-auto min-h-11 w-full rounded-[11px] border-[1.5px] border-primary bg-card p-[13px] text-[15px] font-semibold whitespace-normal text-primary shadow-[0_2px_0_0_rgba(42,33,30,.12)] hover:bg-background hover:text-primary"
            >
              {matrix.footer.secondary}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The "reading" state (spec §C.5 A3): the captured photo, a gold scanline
    sweeping it, and the brand loader. A failure is a row, never a modal. */
export function ReadingView({ imageUrl }: { imageUrl: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-full flex-col items-center justify-center gap-5 p-6"
    >
      <div className="relative w-full max-w-[280px] overflow-hidden rounded-[8px] bg-console-card">
        {imageUrl ? (
          // A blob: URL from the capture — next/image cannot optimise it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="block max-h-[46vh] w-full object-cover" />
        ) : (
          <div className="aspect-[3/4] w-full" />
        )}
        <div
          aria-hidden
          className="animate-scanline absolute inset-x-0 h-[2px] bg-linear-to-r from-transparent via-gold-light to-transparent shadow-[0_0_14px_2px_rgba(212,175,106,.5)]"
        />
      </div>
      <WineGlassLoader className="text-primary-foreground" />
      <p className="text-[13.5px] text-primary-foreground">{READING}</p>
    </div>
  );
}

/**
 * E1's "Where does it go?" rows (spec §C.5 E1/E1b), on the dark ground. The
 * shell's `choose` view reuses them under the header "Add wine" for search,
 * cellar and by-hand picks made with no destination.
 *
 * - "Tonight's flight · glass N" is drawn only when a flight hint exists — an
 *   option you cannot take is absent, not greyed (D12).
 * - "My cellar" takes the gold when there is no flight row; it and "Just
 *   remember it" are hidden for a cellar lot, which is already in the cellar.
 */
export function Chooser({ flightHint, cellarHint, sourceIsLot, busy, onChoose }: ChooserProps) {
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow size="md" className="text-console-ink">
        Where does it go?
      </Eyebrow>
      {flightHint ? (
        <ChoiceRow
          gold
          disabled={busy}
          title={`Tonight's flight · ${glassLabel(flightHint.position)}`}
          subtitle={flightHintSubtitle({
            tastingName: flightHint.tastingName,
            // Every hint producer passes `phase` (T10); S5c makes it required.
            phase: flightHint.phase ?? "next",
          })}
          onClick={() => onChoose("flight")}
        />
      ) : null}
      {sourceIsLot ? null : (
        <ChoiceRow
          gold={!flightHint}
          disabled={busy}
          title="My cellar"
          subtitle={cellarSubtitle(cellarHint)}
          onClick={() => onChoose("cellar")}
        />
      )}
      <ChoiceRow
        disabled={busy}
        title="Rate it now"
        subtitle="Opens a WSET note for this bottle"
        onClick={() => onChoose("note")}
      />
      {sourceIsLot ? null : (
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => onChoose("catalog")}
          className="h-auto min-h-11 w-full justify-start gap-[11px] rounded-[12px] border border-dashed border-primary-foreground/[.28] px-4 py-[13px] text-left text-[14px] font-normal whitespace-normal text-console-ink hover:border-gold-light hover:bg-transparent hover:text-primary-foreground"
        >
          {busy ? <WineGlassLoader size={16} /> : null}
          Just remember it — save to the catalog only
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** "{producer} {wineName}" for the confirm's Search (spec §C.5 A3). */
function searchQueryFor(draft: WineIdentityDraft): string {
  return [draft.producer?.name, draft.wineName]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

/** E1 "My cellar": what you already hold, or what comes next. */
function cellarSubtitle(hint: ReadConfirmProps["cellarHint"]): string {
  if (hint?.owned) {
    return [
      bottlesLabel(hint.owned.bottles),
      hint.owned.rack ? `rack ${hint.owned.rack}` : null,
      "pick a rack after",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return hint ? `Quantity and rack next · ${bottlesLabel(hint.totalBottles)}` : "Quantity and rack next";
}

function PhotoBand({ imageUrl }: { imageUrl: string }) {
  return (
    <div className="flex h-[26dvh] max-h-[220px] min-h-[150px] shrink-0 items-center justify-center px-4 py-3">
      {/* A local blob URL — next/image cannot optimise it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="The label you photographed"
        className="h-full max-h-[186px] w-1/2 max-w-[198px] rounded-[8px] bg-console-card object-cover"
      />
    </div>
  );
}

/** C.4 rule 4: a single scan's failure replaces the confirm body with the
    same inline row the stack draws — never a modal, never dropped. */
function FailedRead({
  imageUrl,
  busy,
  onRetry,
  onRemove,
}: {
  imageUrl: string;
  busy: boolean;
  onRetry: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col text-primary-foreground">
      <PhotoBand imageUrl={imageUrl} />
      <div className="px-4 pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-[22px] md:px-[22px]">
        <div
          role="alert"
          className="flex flex-wrap items-center gap-[10px] rounded-[10px] border border-miss/55 bg-live/[.14] p-[9px_11px]"
        >
          <span
            aria-hidden
            className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-miss text-[10px] font-bold text-miss"
          >
            !
          </span>
          <span className="min-w-0 flex-1 text-[13.5px]">{FAILED}</span>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onRetry}
              className="h-11 rounded-[9px] border-gold-light bg-transparent px-4 text-[13px] font-bold text-gold-light hover:bg-primary-foreground/10 hover:text-gold-light"
            >
              Retry
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={onRemove}
              className="h-11 rounded-[9px] px-3 text-[13px] font-semibold text-console-ink hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              Remove
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadChip({ label, tone }: { label: string; tone: "ok" | "check" | "gap" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-auto shrink-0 rounded-full px-[10px] py-1 text-left text-[10.5px] font-bold tracking-[.02em] whitespace-normal",
        tone === "ok" ? "border-gold bg-gold/15 text-gold-dark" : "border-gold-deep bg-card text-gold-dark",
      )}
    >
      {label}
    </Badge>
  );
}

// A bordered "Fix" at the chip's height; the pseudo-element pads the tap
// target to 44px without breaking the row.
function FixButton({
  tone,
  disabled,
  onClick,
}: {
  tone: "light" | "dark";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative h-7 rounded-[7px] px-[11px] text-[11.5px] font-bold after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']",
        tone === "dark"
          ? "border-gold-light bg-transparent text-gold-light hover:bg-primary-foreground/10 hover:text-gold-light"
          : "border-gold-deep bg-card text-primary hover:border-gold hover:bg-surface-raised hover:text-primary",
      )}
    >
      Fix
    </Button>
  );
}

function MatchCard({ match }: { match: CatalogMatch }) {
  return (
    <Card className="flex-row items-center gap-[11px] rounded-[12px] border-[1.5px] border-gold bg-background px-[13px] text-foreground ring-0 [--card-spacing:13px]">
      <HatchThumb src={null} width={30} height={40} />
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="text-[14px] font-semibold leading-[1.3]">{match.title}</span>
        {match.meta ? <span className="text-[11.5px] text-muted-foreground">{match.meta}</span> : null}
      </span>
      <CheckDisc tone="light" />
    </Card>
  );
}

function CheckDisc({ tone }: { tone: "light" | "dark" }) {
  return tone === "dark" ? (
    <span
      aria-hidden
      className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-gold-light text-console"
    >
      <Check className="size-[11px]" strokeWidth={3} />
    </span>
  ) : (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
    >
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}

// "Wrong bottle?" and three equal outlined buttons (D6; §2.1 row 6 on E1).
function RecoveryRow({
  tone,
  disabled,
  onRescan,
  onSearch,
  onByHand,
}: {
  tone: "light" | "dark";
  disabled: boolean;
  onRescan: () => void;
  onSearch: () => void;
  onByHand: () => void;
}) {
  const dark = tone === "dark";
  const button = cn(
    "h-auto min-h-11 flex-1 gap-[6px] rounded-[9px] px-2 py-[11px] text-[12.5px] font-semibold",
    dark
      ? "border-primary-foreground/30 bg-transparent text-primary-foreground hover:border-gold-light hover:bg-primary-foreground/10 hover:text-primary-foreground"
      : "border-border bg-card text-primary hover:border-gold hover:bg-surface-raised hover:text-primary",
  );
  return (
    <div className="flex flex-col gap-[7px]">
      <span className={cn("text-[11.5px]", dark ? "text-console-ink" : "text-muted-foreground")}>
        {WRONG_BOTTLE}
      </span>
      <div className="flex gap-[7px]">
        <RecoveryButton className={button} disabled={disabled} onClick={onRescan} icon={<RotateCcw className="size-[15px]" aria-hidden />}>
          Rescan
        </RecoveryButton>
        <RecoveryButton className={button} disabled={disabled} onClick={onSearch} icon={<Search className="size-[15px]" aria-hidden />}>
          Search
        </RecoveryButton>
        <RecoveryButton className={button} disabled={disabled} onClick={onByHand} icon={<Pencil className="size-[15px]" aria-hidden />}>
          By hand
        </RecoveryButton>
      </div>
    </div>
  );
}

function RecoveryButton({
  className,
  disabled,
  onClick,
  icon,
  children,
}: {
  className: string;
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Button type="button" variant="outline" disabled={disabled} onClick={onClick} className={className}>
      {icon}
      {children}
    </Button>
  );
}

function ChoiceRow({
  title,
  subtitle,
  gold = false,
  disabled,
  onClick,
}: {
  title: string;
  subtitle: string;
  gold?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-auto min-h-11 w-full justify-start gap-[11px] rounded-[12px] px-4 text-left whitespace-normal",
        gold
          ? "bg-gold-light py-[15px] text-console shadow-[0_2px_0_0_rgba(42,33,30,.18)] hover:bg-gold hover:text-console"
          : "border border-primary-foreground/[.28] py-[14px] text-primary-foreground hover:border-gold-light hover:bg-transparent hover:text-primary-foreground",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className={gold ? "text-[16px] font-bold" : "text-[15px] font-semibold"}>{title}</span>
        <span className={cn("text-[11.5px] font-normal", gold ? "opacity-75" : "text-console-ink")}>
          {subtitle}
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className={cn("size-[17px] shrink-0", gold ? undefined : "text-gold-light")}
        strokeWidth={gold ? 2.5 : 2}
      />
    </Button>
  );
}
