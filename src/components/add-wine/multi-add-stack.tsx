"use client";

import { useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { scanTitle } from "./format";
import { PendingFixStrip } from "./pending-fix";
import { addedWhere, pendingProblemLabel } from "./scan-copy";
import type { MultiAddStackProps, PendingScan } from "./types";

/**
 * 7d: what has been added this session, stacked above the viewfinder on the
 * dark ground. Added bottles get a gold check and where they went ("glass 4",
 * "in cellar", "in the catalog"); a scan that still needs a vintage is a
 * rose-tinted row with an inline Fix strip — never a blocking error.
 *
 * The "Next bottle · glass N" caption belongs to the viewfinder (the camera
 * view draws it), so `nextGlass` is not rendered here. The rate destination
 * never reaches this stack: its pick is single, adds nothing (so there is no
 * AddedWine to list) and closes the sheet into the WSET note.
 */
export function MultiAddStack({
  added,
  pending,
  onFixPending,
  onRemovePending,
}: MultiAddStackProps) {
  if (added.length === 0 && pending.length === 0) return null;
  return (
    <ul className="flex shrink-0 flex-col gap-[6px] px-4 pb-[10px] md:px-[22px]">
      {added.map((a, i) => (
        <li
          key={a.wineId ?? a.lotId ?? `${a.catalogWineId}-${i}`}
          className="flex items-center gap-[10px] rounded-[10px] border border-primary-foreground/[.16] bg-primary-foreground/[.08] p-[9px_11px] text-primary-foreground"
        >
          <span
            aria-hidden
            className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-gold-light text-console"
          >
            <Check className="size-[11px]" strokeWidth={3} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px]">{a.label}</span>
          <span className="shrink-0 text-[11px] text-console-ink">{addedWhere(a)}</span>
        </li>
      ))}
      {pending.map((p) => (
        <PendingRow
          key={p.id}
          scan={p}
          onFix={onFixPending}
          onRemove={onRemovePending}
        />
      ))}
    </ul>
  );
}

function PendingRow({
  scan,
  onFix,
  onRemove,
}: {
  scan: PendingScan;
  onFix: MultiAddStackProps["onFixPending"];
  onRemove: MultiAddStackProps["onRemovePending"];
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const title = scanTitle(scan.prefill);

  return (
    <li className="flex flex-col rounded-[10px] border border-miss/55 bg-live/[.14] p-[9px_11px] text-primary-foreground">
      <div className="flex items-center gap-[10px]">
        <span
          aria-hidden
          className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-miss text-[10px] font-bold text-miss"
        >
          !
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px]">
          {title} <span className="text-miss">· {pendingProblemLabel(scan.problem)}</span>
        </span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            // Focus inside the tap so the phone keyboard opens with the strip.
            const next = !open;
            setOpen(next);
            // preventScroll: the strip is still clipped at this instant.
            if (next) inputRef.current?.focus({ preventScroll: true });
          }}
          className={cn(
            "relative shrink-0 text-[11.5px] font-semibold text-gold-light hover:text-gold",
            "after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']",
          )}
        >
          {open ? "Close" : "Fix"}
        </button>
        <button
          type="button"
          aria-label={`Remove ${title}`}
          onClick={() => onRemove(scan.id)}
          className="relative flex size-6 shrink-0 items-center justify-center rounded-full text-console-ink hover:text-primary-foreground after:absolute after:-inset-2 after:content-['']"
        >
          <X className="size-[13px]" />
        </button>
      </div>
      <PendingFixStrip
        open={open}
        inputRef={inputRef}
        onFix={(fix) => onFix(scan.id, fix)}
      />
    </li>
  );
}
