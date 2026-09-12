"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { cn } from "@/lib/utils";
import type { ExtractedLabel } from "@/lib/label-scan/extract";
import type { ScanMatch } from "@/app/scan/actions";
import { identityFromPrefill, wineMetaFromExtracted, wineTitleFromExtracted } from "./format";
import {
  chooserEyebrow,
  confidenceChip,
  flightHintSubtitle,
  flightNote,
  primaryAddLabel,
  shouldStackPending,
} from "./scan-copy";
import type { AddSource, FlightHint, ScanConfirmProps } from "./types";

export type Choice = "flight" | "cellar" | "rate" | "catalog-only";

/**
 * 7c read-and-confirm: the photo stays in the top band, the lower part is a
 * parchment panel — parsed identity + confidence chip, the primary catalog
 * match (alternatives one tap away), the recovery row, the flight note and
 * the destination footer. With no destination (7i) the panel is the dark
 * chooser instead: where does this bottle go?
 *
 * Adds never happen here: `onAdd` hands the shell the source — the chosen
 * catalog match, or the identity built from the prefill when the read is
 * complete. An incomplete read routes to the by-hand form prefilled. For the
 * rate destination the same footer reads "Rate this wine" and the shell turns
 * the source into a rate pick (the note opens) instead of an add.
 */
export function ScanConfirm({
  ctx,
  imageUrl,
  result,
  prefill,
  onRescan,
  onSearch,
  onByHand,
  onAdd,
  onPending,
  onChoose,
  busy,
}: ScanConfirmProps) {
  // "Use this" on an alternative swaps the primary; the state is only the
  // chosen id so a fresh result (another scan) never carries a stale pick.
  const [chosenId, setChosenId] = useState<string | null>(null);
  // 7i: a choice adopts a destination in the shell, which would otherwise
  // swap this dark chooser for the parchment 7c layout for the length of the
  // server call. The flag keeps the chooser (busy) on screen until the add
  // resolves — on success the shell closes or moves on and this unmounts.
  const [choosing, setChoosing] = useState(false);
  const matches = result.matches;
  const primary = matches.find((m) => m.id === chosenId) ?? matches[0] ?? null;
  const alternatives = primary ? matches.filter((m) => m.id !== primary.id).slice(0, 4) : [];
  const identity = identityFromPrefill(prefill);
  const source: AddSource | null = primary
    ? { kind: "catalog", catalogWineId: primary.id }
    : identity
      ? { kind: "identity", identity }
      : null;
  const title = wineTitleFromExtracted(result.extracted);
  const meta = wineMetaFromExtracted(result.extracted);

  const add = async (andScanNext: boolean) => {
    if (busy) return;
    // "Scan the next" on an unread vintage: a 7d Fix row, not the form.
    if (shouldStackPending(andScanNext, prefill, matches.length)) {
      onPending(prefill);
      return;
    }
    if (!source) {
      onByHand(prefill);
      return;
    }
    await onAdd(source, { andScanNext });
  };
  const choose = async (kind: Choice) => {
    if (busy || choosing) return;
    setChoosing(true);
    try {
      await onChoose({ kind });
      if (source) await onAdd(source, { andScanNext: false });
      else onByHand(prefill);
    } finally {
      setChoosing(false);
    }
  };

  if (!ctx.destination || choosing) {
    return (
      <Chooser
        imageUrl={imageUrl}
        title={title}
        meta={meta}
        eyebrow={chooserEyebrow(matches.length)}
        matched={matches.length > 0}
        confidence={result.extracted.confidence}
        flightHint={ctx.flightHint}
        busy={busy || choosing}
        onRescan={onRescan}
        onChoose={choose}
      />
    );
  }

  const note = flightNote(ctx.destination);
  // "Add and scan the next" keeps a camera going: touch devices only (the
  // device rule — a mouse device's home is the upload zone, 2026-09-12), and
  // never for a rate pick, which is one wine and then its note.
  const scanNext = !ctx.isDesktop && ctx.destination.kind !== "rate";
  const incompleteHint = !primary && !identity
    ? prefill.vintagePrompt
      ? "No vintage read — you can type it on the next step."
      : "A few details are missing — finish them on the next step."
    : null;

  return (
    <div className="flex min-h-full flex-col">
      {/* The photo, small and centred on the dark ground. */}
      <div className="flex h-[26dvh] max-h-[220px] min-h-[150px] shrink-0 items-center justify-center px-4 py-3">
        {/* A Supabase public URL — no remotePatterns for next/image here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="The label you photographed"
          className="h-full max-h-[186px] w-1/2 max-w-[198px] rounded-[8px] bg-console-card object-cover"
        />
      </div>

      <div className="flex flex-1 flex-col rounded-t-[22px] bg-card text-foreground">
        <div className="flex flex-col gap-[9px] border-b border-border p-[12px_16px] md:px-[22px]">
          <span aria-hidden className="h-1 w-[38px] self-center rounded-full bg-border" />
          <div className="flex items-start gap-[10px]">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h3 className="font-heading text-[21px] font-semibold leading-[1.12]">{title}</h3>
              {meta ? <p className="text-[12px] text-muted-foreground">{meta}</p> : null}
            </div>
            <ConfidencePill confidence={result.extracted.confidence} />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-[10px] p-[12px_16px] md:px-[22px]">
          <Eyebrow size="sm">{primary ? "Matched in the catalog" : "Catalog"}</Eyebrow>
          {primary ? (
            <PrimaryMatchCard match={primary} />
          ) : (
            <div className="flex items-center gap-[11px] rounded-[12px] border border-dashed border-border-strong bg-background p-[13px]">
              <HatchThumb src={imageUrl} alt="" width={30} height={40} />
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="text-[14px] font-semibold leading-[1.3]">
                  Not in the catalog yet — we&apos;ll add it
                </span>
                {incompleteHint ? (
                  <span className="text-[11.5px] text-muted-foreground">{incompleteHint}</span>
                ) : null}
              </span>
            </div>
          )}
          {alternatives.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-[10px] rounded-[12px] border border-border p-[12px_13px]"
            >
              <span className="min-w-0 flex-1 truncate text-[13.5px]">{m.name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => setChosenId(m.id)}
                className="-my-3 flex min-h-11 shrink-0 items-center px-1 text-[12.5px] font-semibold text-primary hover:text-gold-deep disabled:opacity-60"
              >
                Use this
              </button>
            </div>
          ))}

          <RecoveryRow
            onRescan={onRescan}
            onSearch={onSearch}
            onByHand={() => onByHand(prefill)}
            disabled={busy}
          />

          {note ? (
            <div className="mt-auto flex items-center gap-[10px] rounded-[11px] border border-border bg-background p-[11px_13px]">
              <p className="flex-1 text-[12.5px] leading-[1.45] text-ink-photo">{note}</p>
            </div>
          ) : null}
        </div>

        {/* Pinned to the bottom of the sheet's scroll region, like the
            search / cellar / by-hand footers — on a small phone the panel
            is taller than the viewport once alternatives are listed. */}
        <div className="sticky bottom-0 z-10 mt-auto flex shrink-0 flex-col gap-2 border-t border-border bg-background px-4 pt-[11px] pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-4 md:px-[22px]">
          <button
            type="button"
            disabled={busy}
            onClick={() => void add(false)}
            className="flex min-h-11 w-full items-center justify-center gap-[9px] rounded-[11px] bg-primary p-[15px] text-[16.5px] font-semibold text-primary-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors hover:bg-[#4A1523] disabled:opacity-60 [&_svg]:size-[17px]"
          >
            {busy ? <WineGlassLoader /> : null}
            {primaryAddLabel(ctx.destination)}
          </button>
          {scanNext ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void add(true)}
              className="flex min-h-11 w-full items-center justify-center gap-[9px] rounded-[11px] border-[1.5px] border-primary bg-card p-[13px] text-[15px] font-semibold text-primary shadow-[0_2px_0_0_rgba(42,33,30,.12)] transition-colors hover:bg-background disabled:opacity-60"
            >
              Add and scan the next
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PrimaryMatchCard({ match }: { match: ScanMatch }) {
  return (
    <div className="flex items-center gap-[11px] rounded-[12px] border-[1.5px] border-gold bg-background p-[13px]">
      <HatchThumb src={null} width={30} height={40} />
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="text-[14px] font-semibold leading-[1.3]">{match.name}</span>
      </span>
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
    </div>
  );
}

function ConfidencePill({
  confidence,
  dark = false,
}: {
  confidence: ExtractedLabel["confidence"];
  dark?: boolean;
}) {
  const chip = confidenceChip(confidence);
  const tone = dark
    ? {
        ok: "border-gold-light bg-gold-light/15 text-gold-light",
        check: "border-gold-light/70 text-gold-light",
        hard: "border-miss bg-live/15 text-miss",
      }[chip.tone]
    : {
        ok: "border-gold bg-gold/15 text-gold-dark",
        check: "border-gold-deep text-gold-dark",
        hard: "border-rose bg-rose/10 text-rose",
      }[chip.tone];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-[6px] rounded-full border px-[10px] py-1 text-[10.5px] font-bold tracking-[.02em]",
        tone,
      )}
    >
      {chip.label}
    </span>
  );
}

// "Wrong bottle?" Rescan · Search by name · By hand — 44px tap pads via the
// pseudo-element so the row keeps the handoff's height.
function RecoveryRow({
  onRescan,
  onSearch,
  onByHand,
  disabled,
}: {
  onRescan: () => void;
  onSearch: () => void;
  onByHand: () => void;
  disabled: boolean;
}) {
  const link =
    "relative shrink-0 text-[12.5px] font-semibold text-primary hover:text-gold-deep disabled:opacity-60 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']";
  const dot = <span className="text-[12.5px] text-muted-foreground">·</span>;
  return (
    <div className="flex flex-wrap items-center gap-[10px] px-[2px] py-[2px]">
      <span className="text-[12.5px] text-muted-foreground">Wrong bottle?</span>
      <button type="button" onClick={onRescan} disabled={disabled} className={link}>
        Rescan
      </button>
      {dot}
      <button type="button" onClick={onSearch} disabled={disabled} className={link}>
        Search by name
      </button>
      {dot}
      <button type="button" onClick={onByHand} disabled={disabled} className={link}>
        By hand
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7i: no destination. The photo fills the view under a dark gradient and the
// footer asks once where the bottle goes, tonight's tasting first. The shell
// reuses it for a search hit or a by-hand entry made with no destination —
// then there is no photo, no read confidence and nothing to rescan, so those
// are optional and the footer sits on the plain dark ground.
// ---------------------------------------------------------------------------

export function Chooser({
  imageUrl = null,
  title,
  meta,
  eyebrow,
  matched,
  confidence = null,
  flightHint,
  busy,
  onRescan,
  onChoose,
}: {
  imageUrl?: string | null;
  title: string;
  meta: string;
  /** "Found in the catalog" · "Read from the label" · "Entered by hand". */
  eyebrow: string;
  /** Draws the gold check disc before the eyebrow (a catalog wine). */
  matched: boolean;
  confidence?: ExtractedLabel["confidence"] | null;
  flightHint: FlightHint | null;
  busy: boolean;
  onRescan?: () => void;
  onChoose: (kind: Choice) => Promise<void>;
}) {
  return (
    <div className="relative flex min-h-full flex-col text-primary-foreground">
      {imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-linear-to-t from-[#15100D] from-34% via-[#15100D]/40 via-70% to-[#15100D]/15"
          />
        </>
      ) : null}

      <div className="relative mt-auto flex flex-col gap-[14px] px-4 pt-12 pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-[22px] md:px-[22px]">
        <div className="flex flex-col gap-[7px]">
          <Eyebrow size="md" className="flex items-center gap-2 text-gold-light">
            {matched ? (
              <span
                aria-hidden
                className="flex size-[18px] items-center justify-center rounded-full bg-gold-light text-console"
              >
                <Check className="size-[11px]" strokeWidth={3} />
              </span>
            ) : null}
            {eyebrow}
          </Eyebrow>
          <h3 className="font-heading text-[29px] font-semibold leading-[1.06]">{title}</h3>
          {meta ? <p className="text-[12.5px] text-console-ink">{meta}</p> : null}
        </div>

        {confidence && onRescan ? (
          <div className="flex flex-wrap items-center gap-[10px] text-[12.5px]">
            <ConfidencePill confidence={confidence} dark />
            <span className="text-console-ink">Wrong bottle?</span>
            <button
              type="button"
              onClick={onRescan}
              disabled={busy}
              className="relative font-semibold text-gold-light hover:text-gold disabled:opacity-60 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']"
            >
              Rescan
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Eyebrow size="md" className="text-console-ink">
            Where does it go?
          </Eyebrow>
          {flightHint ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onChoose("flight")}
              className="flex min-h-11 w-full items-center gap-[11px] rounded-[12px] bg-gold-light p-[15px_16px] text-left text-console shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors hover:bg-gold disabled:opacity-60"
            >
              <span className="flex flex-1 flex-col gap-[2px]">
                <span className="text-[16px] font-bold">
                  Tonight&apos;s flight · glass {flightHint.position}
                </span>
                <span className="text-[11.5px] opacity-75">{flightHintSubtitle(flightHint)}</span>
              </span>
              <ChevronRight className="size-[17px] shrink-0" strokeWidth={2.5} />
            </button>
          ) : null}
          <ChoiceRow
            title="My cellar"
            subtitle="pick a rack after"
            busy={busy}
            onClick={() => void onChoose("cellar")}
          />
          <ChoiceRow
            title="Rate it now"
            subtitle="Opens a WSET note for this bottle"
            busy={busy}
            onClick={() => void onChoose("rate")}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void onChoose("catalog-only")}
            className="flex min-h-11 w-full items-center gap-[11px] rounded-[12px] border border-dashed border-primary-foreground/[.28] p-[13px_16px] text-left text-[14px] text-console-ink transition-colors hover:border-gold-light disabled:opacity-60"
          >
            {busy ? <WineGlassLoader size={16} className="shrink-0" /> : null}
            Just remember it — save to the catalog only
          </button>
        </div>
      </div>
    </div>
  );
}

function ChoiceRow({
  title,
  subtitle,
  busy,
  onClick,
}: {
  title: ReactNode;
  subtitle: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-[11px] rounded-[12px] border border-primary-foreground/[.28] p-[14px_16px] text-left transition-colors hover:border-gold-light disabled:opacity-60"
    >
      <span className="flex flex-1 flex-col gap-[2px]">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-[11.5px] text-console-ink">{subtitle}</span>
      </span>
      <ChevronRight className="size-[17px] shrink-0 text-gold-light" />
    </button>
  );
}
