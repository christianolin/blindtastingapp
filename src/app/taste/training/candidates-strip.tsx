"use client";

// Below lg: the 44 px strip in the WSET sheet's sticky bar (`belowBar`, spec
// §3.3) — "Top match: Pauillac 91 % · 2 more close" — which opens the
// candidates sheet. It re-renders with every answer. Exactly 44 px tall with
// no outer margin, so the sheet's section scroll margin (which allows 44 px
// for the strip below lg) is exact: the gap under the section tabs is the
// button's own top padding, and the whole 44 px is the tap target.
import type { Ref } from "react";
import { ChevronUp } from "lucide-react";
import { stripLine } from "@/lib/training/copy";
import type { RankedCandidate } from "@/lib/training/types";

export function CandidatesStrip({
  ranked,
  open,
  onOpen,
  ref,
}: {
  ranked: RankedCandidate[];
  /** Whether the candidates sheet it opens is open. */
  open: boolean;
  onOpen: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onOpen}
      className="group flex h-11 w-full pt-2 text-left outline-none lg:hidden"
    >
      <span className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-border bg-card px-3 text-[13px] font-semibold text-foreground group-focus-visible:ring-3 group-focus-visible:ring-ring/50">
        <span className="min-w-0 flex-1 truncate">{stripLine(ranked)}</span>
        <ChevronUp aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </span>
    </button>
  );
}
