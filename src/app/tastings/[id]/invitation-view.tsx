import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getTastingRow } from "@/lib/tasting-request-cache";
import { TastingPageHeader } from "./tasting-page-header";
import { respondToInvite } from "./actions";

// The INVITED card (BT-D2, moved without change from page.tsx): reached for
// an INVITED (non-host) viewer of a tasting that has not closed — DRAFT or
// IN_PROGRESS alike (spec §4.3 item 5 names both). A CLOSED tasting's
// INVITED viewer is routed to finished-view.tsx instead (T4's "has
// finished" card, entry-6), so this view's card is always the live Accept /
// Decline one. BT-G1 replaces this with the full phone invitation.
export async function InvitationView({
  tastingId,
}: {
  tastingId: string;
}): Promise<React.JSX.Element | null> {
  const supabase = await createClient();
  const tasting = await getTastingRow(tastingId);
  if (!tasting) return null;

  const { data: hostProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", tasting.host_id)
    .maybeSingle();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <TastingPageHeader tastingId={tastingId} />
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">You&apos;re invited</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {hostProfile?.display_name ?? "The host"} invited you to this
            tasting. Accept to take part.
          </p>
          <div className="flex gap-2">
            <form action={respondToInvite}>
              <input type="hidden" name="tasting_id" value={tastingId} />
              <input type="hidden" name="response" value="accept" />
              <Button type="submit">Accept</Button>
            </form>
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
