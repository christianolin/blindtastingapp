"use client";

import { Check, ChevronRight, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FollowUpViewProps } from "./types";

/**
 * D3 (spec §C.5): the catalog's follow-up, the one place the sheet asks what
 * next — recording a wine is not using it. Shown after a single catalog add
 * or confirm. Only the header line depends on whether a row was written; the
 * two follow-ups (ledger D4: "Add it to my cellar", "Taste & rate it now") and
 * Done are the same either way. The shell performs what each one opens.
 */
export function FollowUpView({ followUp, onCellar, onNote, onDone }: FollowUpViewProps) {
  const { title, written } = followUp;
  return (
    <div className="flex flex-col gap-[14px] p-4 md:p-[18px_22px]">
      <div role="status" className="flex items-center gap-[11px]">
        {written ? (
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <Check className="size-3" strokeWidth={3} />
          </span>
        ) : (
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] border-gold text-gold-dark"
          >
            <Library className="size-3" strokeWidth={2.5} />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="font-heading text-[19px] font-semibold leading-[1.15]">
            {written ? "Added to the catalog" : "Already in the catalog"}
          </span>
          {title ? <span className="text-[12px] text-muted-foreground">{title}</span> : null}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <FollowUpRow title="Add it to my cellar" subtitle="Quantity and rack" onClick={onCellar} />
        <FollowUpRow title="Taste & rate it now" subtitle="Opens a note on this bottle" onClick={onNote} />
        <Button
          type="button"
          variant="ghost"
          onClick={onDone}
          className="h-auto min-h-11 w-full justify-start rounded-[11px] border border-dashed border-border px-[14px] py-3 text-left text-[13.5px] font-normal whitespace-normal text-muted-foreground hover:border-gold hover:bg-white hover:text-foreground"
        >
          Done — add another wine
        </Button>
      </div>
    </div>
  );
}

function FollowUpRow({ title, subtitle, onClick }: { title: string; subtitle: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="h-auto min-h-11 w-full justify-start gap-[11px] rounded-[11px] border-gold bg-background px-[14px] py-[13px] text-left whitespace-normal text-foreground hover:bg-white hover:text-foreground"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="text-[14px] font-semibold">{title}</span>
        <span className="text-[11.5px] font-normal text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-primary" />
    </Button>
  );
}
