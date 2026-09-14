import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser, getTastingRow, getViewerParticipant } from "@/lib/tasting-request-cache";
import { getTastingResult } from "@/lib/tasting-result";
import { TastingPageHeader } from "./tasting-page-header";
import { ClosedSurface } from "./result/closed-surface";
import { ResultView } from "./result/result-view";
import { RecordView } from "./record/record-view";
import { respondToInvite } from "./actions";

// The CLOSED page. An INVITED viewer gets T4's "This tasting has finished"
// card instead (entry-6) — CLOSED routes here ahead of the INVITED check in
// view-route.ts, so this view (not invitation-view.tsx) is the one that
// must show it.
//
// BT-R2 wrapped the old running-page board (BT-D2, moved without change from
// page.tsx) in `ClosedSurface`: the result screen (S12) until the viewer
// dismisses it, then that same board again. BT-R3 swaps that "then" for the
// parchment record (S13) — `RecordView` is now the sole CLOSED board; the
// old board's wine-chip navigator, `WinesCard` and `PlayExperience` are
// superseded (RecordView's own "Glass by glass" rows replace them, and it
// keeps refinement 27's "an outsider never gets a board" rule on its own
// terms). The header renders outside `ClosedSurface` on purpose (spec §6.3
// item 3): its "unknown" (SSR) render shows nothing, so a static header
// above it is what a reload shows first, never a flash of the dark result.
export async function FinishedView({
  tastingId,
}: {
  tastingId: string;
}): Promise<React.JSX.Element | null> {
  const [user, tasting] = await Promise.all([getCurrentUser(), getTastingRow(tastingId)]);
  if (!user || !tasting) return null;

  const viewer = await getViewerParticipant(tastingId);
  const myStatus = viewer?.status ?? null;

  if (myStatus === "INVITED") {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 sm:p-8">
        <TastingPageHeader tastingId={tastingId} showPlace={false} />
        <Card className="border-border bg-muted/40">
          <CardHeader>
            <CardTitle className="text-base">You&apos;re invited</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              This tasting has finished. Decline to clear it from your
              invites.
            </p>
            <div className="flex gap-2">
              <form action={respondToInvite}>
                <input type="hidden" name="tasting_id" value={tastingId} />
                <input type="hidden" name="response" value="decline" />
                <Button type="submit" variant="outline">
                  Decline
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const result = await getTastingResult(tastingId);

  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="mx-auto w-full max-w-5xl px-6 pt-6 sm:px-8 sm:pt-8">
        {/* Never the place on the CLOSED page (spec §13.3 item 5): this
            header sits above both the result and the record. */}
        <TastingPageHeader tastingId={tastingId} showPlace={false} />
      </div>
      <ClosedSurface
        tastingId={tastingId}
        result={result ? <ResultView data={result} /> : null}
      >
        <RecordView tastingId={tastingId} />
      </ClosedSurface>
    </div>
  );
}
