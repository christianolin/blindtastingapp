"use client";

import { ChevronRight, Plus } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { nearMatchCopy } from "./near-match-copy";
import type { NearMatchViewProps } from "./types";

/**
 * "Already in the catalog?" (catalog dedupe, owner 2026-10-03). Shown by the
 * shell over the view an add was started from, whenever that add would create
 * a new catalog wine and close matches exist. Picking a wine reuses it; another
 * vintage of the same wine can be added as the bottle's own vintage; a new
 * producer name can be swapped for an existing producer ("Did you mean …?");
 * creating a new wine takes a deliberate tap. It performs no write itself, and
 * every destination-dependent word comes from `matrix`.
 */
export function NearMatchView({
  matches,
  matrix,
  dark,
  busy,
  onUse,
  onAddAsVintage,
  onProducer,
  onNew,
  onBack,
}: NearMatchViewProps) {
  const copy = nearMatchCopy;
  const muted = dark ? "text-console-ink" : "text-muted-foreground";
  const rowFrame = cn(
    "flex flex-col gap-2 rounded-[11px] border px-[14px] py-3",
    dark ? "border-white/15 bg-white/5" : "border-border bg-background",
  );

  return (
    <section aria-labelledby="near-match-title" className="flex flex-col gap-[14px] p-4 md:p-[18px_22px]">
      <div className="flex flex-col gap-1">
        {/* The shell scrolls to the top and focuses this heading when the prompt
            opens, so a long by-hand form scrolled down never lands the person on
            "Add as a new wine" with the matches above the fold. */}
        <h2 id="near-match-title" tabIndex={-1} className="font-heading text-[21px] font-semibold leading-[1.15] outline-none">
          {copy.title}
        </h2>
        <p className={cn("text-[12.5px]", muted)}>{copy.lead}</p>
      </div>

      {matches.producers.length > 0 ? (
        <div className="flex flex-col gap-2">
          {matches.producers.map((producer) => (
            <Button
              key={producer.id}
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onProducer(producer)}
              className={cn(
                "h-auto min-h-11 w-full justify-start gap-[11px] rounded-[11px] border-gold px-[14px] py-3 text-left whitespace-normal",
                dark ? "bg-transparent text-primary-foreground hover:bg-white/10 hover:text-primary-foreground" : "bg-background text-foreground hover:bg-surface-raised hover:text-foreground",
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="text-[14px] font-semibold">{copy.didYouMean(producer.name)}</span>
                <span className={cn("text-[11.5px] font-normal", muted)}>
                  {copy.producerMeta(producer.regionName, producer.wineCount)}
                </span>
              </span>
              <ChevronRight aria-hidden className={cn("size-4 shrink-0", dark ? "text-gold-light" : "text-primary")} />
            </Button>
          ))}
        </div>
      ) : null}

      {matches.wines.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Eyebrow size="sm" className={cn(dark && "text-console-ink")}>{copy.winesEyebrow}</Eyebrow>
          <ul className="flex flex-col gap-2">
            {matches.wines.map((row) => (
              <li key={row.candidate.id} className={rowFrame}>
                <div className="flex min-w-0 flex-col gap-[2px]">
                  <span className="text-[14px] font-semibold">{row.title}</span>
                  {row.meta ? <span className={cn("text-[12px]", muted)}>{row.meta}</span> : null}
                  {row.differences.length > 0 ? (
                    <span className={cn("text-[12px]", dark ? "text-gold-light" : "text-gold-dark")}>
                      {copy.differs(row.differences)}
                    </span>
                  ) : null}
                </div>
                {/* A row in another vintage never makes "use" the filled button: in a
                    flight it would become the answer key, in a cellar the lot. Its
                    filled action is "Add it as {vintage}" when that applies; "use"
                    stays as an outline button that names the vintage it takes. */}
                <div className="flex flex-wrap gap-2">
                  {row.addAsVintage ? (
                    <Button type="button" size="sm" disabled={busy} onClick={() => onAddAsVintage(row)} className="min-h-10">
                      {copy.addAsVintage(row.addAsVintage)}
                    </Button>
                  ) : null}
                  {row.otherVintage ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onUse(row)}
                      className={cn("min-h-10", dark && "border-white/30 bg-transparent text-primary-foreground hover:bg-white/10 hover:text-primary-foreground")}
                    >
                      {copy.useOtherVintage(row.otherVintage)}
                    </Button>
                  ) : (
                    <Button type="button" size="sm" disabled={busy} onClick={() => onUse(row)} className="min-h-10">
                      {matrix.nearMatchUse}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onNew}
          className={cn(
            "h-auto min-h-11 w-full justify-start gap-[11px] rounded-[11px] border border-dashed px-[14px] py-3 text-left whitespace-normal",
            dark ? "border-white/30 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground" : "border-border text-foreground hover:border-gold hover:bg-surface-raised",
          )}
        >
          <Plus aria-hidden className="size-4 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span className="text-[13.5px] font-semibold">{copy.addNew}</span>
            <span className={cn("text-[11.5px] font-normal", muted)}>{copy.addNewHint}</span>
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onBack}
          className={cn("min-h-11 self-start", dark && "text-primary-foreground hover:bg-white/10 hover:text-primary-foreground")}
        >
          {copy.back}
        </Button>
      </div>
    </section>
  );
}
