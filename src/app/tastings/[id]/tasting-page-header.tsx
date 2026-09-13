import Link from "next/link";
import { MapPin } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { LocalDateTime } from "@/components/local-date-time";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getParticipantRows,
  getTastingRow,
  getWineRows,
} from "@/lib/tasting-request-cache";
import { getTastingPlace } from "@/app/tastings/new/place";
import { lobbyEyebrowParts } from "@/lib/lobby-copy";
import { glassesSoFarPhrase } from "@/lib/tasting-eyebrow";
import { TastingSettingsButton } from "./tasting-settings-button";

// The thumbnail, eyebrow, name, description, the place line and the host's
// "Tasting settings" entry (spec §3.3 items 1–2, BT-L2; moved and rebuilt
// from the pre-BT-L2 header, which drew a Badge + meta line instead of the
// eyebrow and opened an icon-only popover of host controls). Every view
// renders this at its own top — it loads its own data through the shared
// per-request cache, so rendering it from five different views costs one
// round trip's worth of reads, not five.
export async function TastingPageHeader({
  tastingId,
}: {
  tastingId: string;
}): Promise<React.JSX.Element | null> {
  const supabase = await createClient();
  const [user, tasting, participantRows, wines, place] = await Promise.all([
    getCurrentUser(),
    getTastingRow(tastingId),
    getParticipantRows(tastingId),
    getWineRows(tastingId),
    getTastingPlace(supabase, tastingId),
  ]);
  if (!user || !tasting) return null;

  const isHost = tasting.host_id === user.id;
  const wineCount = wines.length;

  const eyebrowInput = {
    status: tasting.status,
    timingMode: tasting.timing_mode,
    revealMode: tasting.reveal_mode,
    participants: participantRows,
  };
  const laptopEyebrow = lobbyEyebrowParts(eyebrowInput, { phone: false });
  const phoneEyebrow = lobbyEyebrowParts(eyebrowInput, { phone: true });

  // A HOST_PROVIDES guest — never the host, who already gets the Wines
  // card's own caption — gets the flight's running total under the eyebrow
  // (spec §3.3 item 6, LOBBY-05): never a planned count.
  const showGlassesSoFar = !isHost && tasting.wine_source === "HOST_PROVIDES";

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        {tasting.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tasting.image_url}
            alt=""
            className="size-16 shrink-0 rounded-xl border border-border object-cover sm:size-20"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Eyebrow size="md">
              <span className="hidden lg:inline">
                {laptopEyebrow.before.join(" · ")}
                {tasting.scheduled_at ? (
                  <>
                    {" · "}
                    <LocalDateTime iso={tasting.scheduled_at} format="eyebrow" />
                  </>
                ) : null}
                {laptopEyebrow.after.length > 0
                  ? ` · ${laptopEyebrow.after.join(" · ")}`
                  : ""}
              </span>
              <span className="lg:hidden">
                {phoneEyebrow.before.join(" · ")}
                {tasting.scheduled_at ? (
                  <>
                    {" · "}
                    <LocalDateTime iso={tasting.scheduled_at} format="eyebrow-short" />
                  </>
                ) : null}
              </span>
            </Eyebrow>
            {/* The existing /rules link, beside the eyebrow (spec §3.3 item
                1; the CLAUDE.md badge rule, LOBBY-03): BLIND names the
                Danish Championship rules, SEMI_BLIND its own. */}
            <Link
              href="/rules"
              className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              {tasting.reveal_mode === "SEMI_BLIND"
                ? "Semi-blind scoring"
                : "Danish Championship scoring"}
            </Link>
          </div>
          <h1 className="mt-1.5 font-heading text-3xl font-semibold tracking-tight">
            {tasting.name}
          </h1>
          {tasting.description ? (
            <p className="mt-1.5 text-muted-foreground">{tasting.description}</p>
          ) : null}
          {/* The place line, members only — RLS on tasting_places hands
              getTastingPlace null for anyone else (spec §3.3 item 1, §13). */}
          {place ? (
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              {place}
            </p>
          ) : null}
          {showGlassesSoFar ? (
            <span className="mt-2 inline-flex w-fit items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {glassesSoFarPhrase(wineCount)}
            </span>
          ) : null}
        </div>
      </div>
      {isHost ? (
        <div className="shrink-0">
          {/* "Tasting settings" (spec §3.3 item 2, LOBBY-04): a labelled
              button from lg, a 34px gear icon below it — TastingSettingsButton
              itself renders each form, so both copies are mounted and only
              one is ever visible. */}
          <span className="hidden lg:inline-flex">
            <TastingSettingsButton tastingId={tastingId} phone={false} />
          </span>
          <span className="lg:hidden">
            <TastingSettingsButton tastingId={tastingId} phone={true} />
          </span>
        </div>
      ) : null}
    </div>
  );
}
