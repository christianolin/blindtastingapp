"use client";

// Below lg: the 44 px strip in the WSET sheet's sticky bar (`belowBar`, spec
// §3.3) — "Top match: Pauillac 91 % · 2 more close" — which opens the
// candidates sheet. It re-renders with every answer.
import { ChevronUp } from "lucide-react";
import { stripLine } from "@/lib/training/copy";
import type { RankedCandidate } from "@/lib/training/types";

export function CandidatesStrip({ ranked, onOpen }: { ranked: RankedCandidate[]; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className="mt-2 flex h-11 w-full items-center gap-2 rounded-[10px] border border-border bg-card px-3 text-left text-[13px] font-semibold text-foreground lg:hidden"
    >
      <span className="min-w-0 flex-1 truncate">{stripLine(ranked)}</span>
      <ChevronUp aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
