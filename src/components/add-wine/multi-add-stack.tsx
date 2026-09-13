"use client";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { itemRowCopy, type ItemRowCopy, type ScanItem } from "./sheet-state";
import type { MultiAddStackProps } from "./types";

type RowAction = ItemRowCopy["actions"][number];

const ROW = "flex items-center gap-[10px] rounded-[10px] border p-[9px_11px] text-primary-foreground";

/**
 * A4 (dark tone): this session's bottles, stacked above the viewfinder. Every
 * row's copy comes from `itemRowCopy` (sheet-state.ts), which the laptop list
 * renders too:
 * - added: a gold ✓, the label and where it went ("glass N");
 * - incomplete (a flight glass added without every field) or pending (nothing
 *   written yet): "!", "{title} · {what did not read}" and a bordered Fix;
 *   pending rows also get a remove ✕;
 * - failed: "Couldn't read this photo" · Retry · Remove — a row, never a
 *   modal (D6);
 * - uploading or reading: the photo's thumbnail and "Reading the label…".
 *
 * Fix, Retry and Remove report the row's id; the shell does the rest (Fix
 * focuses the by-hand form inside the same tap).
 */
export function MultiAddStack({ items, destination, onItemAction }: MultiAddStackProps) {
  if (items.length === 0) return null;
  return (
    <ul className="flex shrink-0 flex-col gap-[6px] px-4 pb-[10px] md:px-[22px]">
      {items.map((item) => (
        <StackRow
          key={item.id}
          item={item}
          copy={itemRowCopy(item, destination)}
          onAction={(action) => onItemAction(item.id, action)}
        />
      ))}
    </ul>
  );
}

function StackRow({
  item,
  copy,
  onAction,
}: {
  item: ScanItem;
  copy: ItemRowCopy;
  onAction: (action: RowAction) => void;
}) {
  if (copy.tone === "added") {
    return (
      <li className={cn(ROW, "border-primary-foreground/[.16] bg-primary-foreground/[.08]")}>
        <span
          aria-hidden
          className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-gold-light text-console"
        >
          <Check className="size-[11px]" strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px]">{copy.label}</span>
        {copy.detail ? <span className="shrink-0 text-[11px] text-console-ink">{copy.detail}</span> : null}
      </li>
    );
  }

  if (copy.tone === "reading") {
    return (
      <li role="status" className={cn(ROW, "border-primary-foreground/[.16] bg-primary-foreground/[.08]")}>
        {/* A local blob URL — next/image cannot optimise it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.photoUrl} alt="" className="h-8 w-6 shrink-0 rounded-[4px] bg-console-card object-cover" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-console-ink">{copy.label}</span>
      </li>
    );
  }

  // incomplete, pending and failed: something still needs the user.
  const { head, gap } = splitGap(copy.label);
  return (
    <li className={cn(ROW, "border-miss/55 bg-live/[.14]")}>
      <span
        aria-hidden
        className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-miss text-[10px] font-bold text-miss"
      >
        !
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="line-clamp-2 text-[13px]">
          {head}
          {gap ? <span className="text-miss"> · {gap}</span> : null}
        </span>
        {copy.detail ? (
          <span role="alert" className="text-[11px] text-miss">
            {copy.detail}
          </span>
        ) : null}
      </span>
      {copy.actions.map((action) => (
        <RowActionButton
          key={action}
          action={action}
          textRemove={copy.tone === "failed"}
          label={copy.label}
          onClick={() => onAction(action)}
        />
      ))}
    </li>
  );
}

/** "Cigliuti, Barbaresco · no vintage read" → the title, and the part the
    handoff tints: only a trailing describeUnread phrase ("no … read"). */
function splitGap(label: string): { head: string; gap: string | null } {
  const at = label.lastIndexOf(" · ");
  if (at < 0) return { head: label, gap: null };
  const tail = label.slice(at + 3);
  return /^no .+ read$/.test(tail) ? { head: label.slice(0, at), gap: tail } : { head: label, gap: null };
}

// Fix and Retry are bordered; a pending row's remove is a ✕, a failed row's a
// word ("Retry" · "Remove"). Pseudo-elements pad each tap target to 44px tall
// without growing the row.
function RowActionButton({
  action,
  textRemove,
  label,
  onClick,
}: {
  action: RowAction;
  textRemove: boolean;
  label: string;
  onClick: () => void;
}) {
  if (action === "remove" && !textRemove) {
    return (
      <Button
        type="button"
        variant="ghost"
        aria-label={`Remove ${label}`}
        onClick={onClick}
        className="relative size-6 shrink-0 rounded-full p-0 text-console-ink after:absolute after:-inset-x-[5px] after:-inset-y-[10px] after:content-[''] hover:bg-transparent hover:text-primary-foreground"
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
        onClick={onClick}
        className="relative h-7 shrink-0 rounded-[7px] px-[6px] text-[11.5px] font-semibold text-console-ink after:absolute after:-inset-x-1 after:-inset-y-2 after:content-[''] hover:bg-transparent hover:text-primary-foreground"
      >
        Remove
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="relative h-7 shrink-0 rounded-[7px] border-gold-light bg-transparent px-[11px] text-[11.5px] font-bold text-gold-light after:absolute after:-inset-x-1 after:-inset-y-2 after:content-[''] hover:bg-primary-foreground/10 hover:text-gold-light"
    >
      {action === "fix" ? "Fix" : "Retry"}
    </Button>
  );
}
