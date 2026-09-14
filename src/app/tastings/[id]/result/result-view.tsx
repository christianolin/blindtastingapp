"use client";

import * as React from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  FINAL_STANDINGS,
  LINK_COPIED,
  SEE_EVERY_WINE,
  YOU_FINISHED,
  resultEyebrow,
  shareLabel,
  shareText,
} from "@/lib/result-copy";
import type { TastingResultView } from "@/lib/tasting-result";

// S12 (phone) / S12b (laptop): the dark result a CLOSED tasting shows until
// dismissed (B5; spec §11.3 items 8-10). Purely presentational — every
// string arrives already formatted from `getTastingResult`
// (`result-copy.ts`, run on the server), so this component only lays them
// out and owns the two bits of interactivity copy alone can't do: Share
// (`navigator.share`, clipboard fallback) and "See every wine"
// (`onDismiss`, wired in by `ClosedSurface` via `cloneElement`).
//
// "Best glass" is spec-scoped to blind (§11.3 item 10): `strongest` is
// already null for semi-blind (`semiBlindResult` never sets it), but
// `bestGlass` is not — `bestGlass()` still finds a highest-share glass for a
// semi-blind flight, so this component is the one that hides the card for
// `mode === "SEMI_BLIND"`.

const phoneTable = (table: TastingResultView["table"]) => {
  const top4 = table.slice(0, 4);
  if (top4.some((r) => r.isViewer)) return top4;
  const mine = table.find((r) => r.isViewer);
  return mine ? [...top4, mine] : top4;
};

function StandingsRow({ row }: { row: TastingResultView["table"][number] }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
        row.isViewer && "bg-primary/15 font-medium",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
          {row.tied ? `=${row.rank}` : row.rank}
        </span>
        <span className="truncate">{row.name}</span>
      </span>
      <span className="shrink-0 font-heading tabular-nums">{row.total}</span>
    </div>
  );
}

export function ResultView({
  data,
  onDismiss,
}: {
  data: TastingResultView;
  onDismiss?: () => void;
}): React.JSX.Element {
  const [copied, setCopied] = React.useState(false);

  const handleShare = React.useCallback(async () => {
    const text = shareText(data.share);
    const url = data.resultsUrl;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ url, text });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Fall through to the clipboard fallback below.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      // Nothing else to offer if the clipboard is unavailable too.
    }
  }, [data.share, data.resultsUrl]);

  const showBestGlass = data.bestGlass && data.mode !== "SEMI_BLIND";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {resultEyebrow(data.tastingName)}
      </p>

      <div>
        {data.viewerRole === "host-provides-host" && data.hosted ? (
          <>
            <h1 className="font-heading text-2xl font-semibold sm:text-3xl">{data.hosted.title}</h1>
            {data.hosted.line ? (
              <p className="mt-1 text-muted-foreground">{data.hosted.line}</p>
            ) : null}
          </>
        ) : data.placing ? (
          <>
            <h1 className="font-heading text-2xl font-semibold sm:text-3xl">{YOU_FINISHED}</h1>
            <p className="mt-1 font-heading text-5xl font-bold text-primary sm:text-6xl">
              {data.placing.ordinal}
            </p>
            <p className="mt-1 text-muted-foreground">{data.placing.line}</p>
          </>
        ) : (
          <h1 className="font-heading text-2xl font-semibold sm:text-3xl">{data.tastingName}</h1>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="flex min-w-0 flex-col gap-4">
          {showBestGlass && data.bestGlass ? (
            <Card className="bg-card/70">
              <CardContent className="flex flex-col gap-0.5 p-4">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">Best glass</p>
                <p className="font-heading text-2xl font-semibold text-gold-dark">
                  {data.bestGlass.score}
                </p>
                <p className="text-sm text-muted-foreground">{data.bestGlass.name}</p>
              </CardContent>
            </Card>
          ) : null}

          {data.strongest ? (
            <Card className="bg-card/70">
              <CardContent className="flex flex-col gap-0.5 p-4">
                <p className="font-heading text-lg font-semibold">{data.strongest.title}</p>
                <p className="text-sm text-muted-foreground">
                  {data.strongest.detail} · {data.strongest.caption}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {data.agreedLeast ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">The table agreed least on</span>{" "}
              {data.agreedLeast}
            </p>
          ) : null}

          {data.excluded.length > 0 ? (
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {data.excluded.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}

          {/* Phone standings: top four, the viewer's row appended if outside it. */}
          {data.table.length > 0 ? (
            <div className="flex flex-col gap-0.5 lg:hidden">
              {phoneTable(data.table).map((row) => (
                <StandingsRow key={row.name + row.rank} row={row} />
              ))}
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-3">
            <Button
              onClick={onDismiss}
              className="bg-gold text-foreground hover:bg-gold-deep"
            >
              {SEE_EVERY_WINE}
            </Button>
            <Button variant="outline" onClick={handleShare}>
              <Share2 className="size-4" aria-hidden />
              {copied ? LINK_COPIED : shareLabel({ phone: true })}
            </Button>
          </div>
        </div>

        {/* Laptop standings: the full table, every place. */}
        {data.table.length > 0 ? (
          <Card className="hidden bg-card/70 lg:block">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{FINAL_STANDINGS}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-0.5 p-3">
              {data.table.map((row) => (
                <StandingsRow key={row.name + row.rank} row={row} />
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
