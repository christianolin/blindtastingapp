import { getTastingRow } from "@/lib/tasting-request-cache";
import { TastingPageHeader } from "./tasting-page-header";
import { WinesCard } from "./wines-card";
import { ParticipantsCard } from "./participants-card";

// The JOINED guest's DRAFT layout (BT-D2, moved without change from
// page.tsx): a "waiting for the host to start" message next to the Wines
// card (a bring-your-own guest can already add their own bottle there), and
// the participant roster. BT-G2 replaces this with the full redesigned
// guest lobby (eyebrow, chips, Tonight card, AutoRefresh, Leave).
export async function GuestLobby({
  tastingId,
}: {
  tastingId: string;
}): Promise<React.JSX.Element | null> {
  const tasting = await getTastingRow(tastingId);
  if (!tasting) return null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <TastingPageHeader tastingId={tastingId} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
        <div className="flex min-w-0 flex-col gap-6">
          <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            Waiting for the host to start the tasting.
          </p>
          <WinesCard tastingId={tastingId} />
        </div>
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <ParticipantsCard tastingId={tastingId} />
        </aside>
      </div>
    </div>
  );
}
