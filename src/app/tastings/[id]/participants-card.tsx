import Link from "next/link";
import { MapPin, Wine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getParticipantRows,
  getTastingRow,
  getWineRows,
} from "@/lib/tasting-request-cache";
import { getBulkProfileSummaries } from "@/lib/profile-stats";
import { bringsWineLine, participantsSummary, PARTICIPANTS_FOOTER } from "@/lib/lobby-copy";
import { cn } from "@/lib/utils";
import { isDeletedProfile } from "@/lib/account/delete-account";

// A roster row's frame: a link to the person's profile or, for a deleted
// account, which has no profile to open (D16), the same layout in a plain
// element, without the hover tint that promises a link.
function RowFrame({
  href,
  className,
  children,
}: {
  href: string | null;
  className: string;
  children: React.ReactNode;
}) {
  return href ? (
    <Link href={href} className={cn(className, "transition-colors hover:bg-muted/60")}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

// Full participant roster with cross-tasting stats (spec §3.3 item 8; BT-D2
// moved this without change, BT-L2 rebuilds it): each row links to the
// person's profile and shows their avatar, a Host badge, their In/Invited
// status, a location/favorite-wine info line, and a cross-tasting stats line
// fetched via getBulkProfileSummaries — the batched helper, per its own rule
// about many-people stat surfaces. JOINED and INVITED are listed; DECLINED
// collapses to one muted line and is not counted (LOBBY-17). Below `lg` the
// rich rows give way to a row of plain chips (LOBBY-25).
export async function ParticipantsCard({
  tastingId,
}: {
  tastingId: string;
}): Promise<React.JSX.Element | null> {
  const supabase = await createClient();
  const [user, tasting, participantRows, wines] = await Promise.all([
    getCurrentUser(),
    getTastingRow(tastingId),
    getParticipantRows(tastingId),
    getWineRows(tastingId),
  ]);
  if (!tasting) return null;

  const isByo = tasting.wine_source === "PARTICIPANT_CONTRIBUTED";
  const viewerIsHost = user !== null && user.id === tasting.host_id;

  const userIds = participantRows.map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email, avatar_url, location, favorite_wine_type, deleted_at")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  // A deleted account (D16) keeps its seat and its name, "Deleted user", but
  // no profile link and no cross-tasting stats line, so it is left out of the
  // batched stats read altogether.
  const deletedUserIds = new Set(
    (profiles ?? []).filter((p) => isDeletedProfile(p)).map((p) => p.id),
  );
  const statsByUserId = await getBulkProfileSummaries(
    userIds.filter((id) => !deletedUserIds.has(id)),
  );

  // Each bring-your-own contributor's first glass, by list order (D10, the
  // same numbering `wineLabel` uses elsewhere) — "brings wine {N}", null
  // before they have added one (LOBBY-19).
  const firstGlassByParticipant = new Map<string, number>();
  if (isByo) {
    wines.forEach((w, i) => {
      if (w.contributor_participant_id && !firstGlassByParticipant.has(w.contributor_participant_id)) {
        firstGlassByParticipant.set(w.contributor_participant_id, i + 1);
      }
    });
  }

  const { count, declinedLine } = participantsSummary(participantRows);
  const listed = participantRows.filter((p) => p.status === "JOINED" || p.status === "INVITED");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Participants
          <span className="text-sm font-normal text-muted-foreground">{count}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Laptop: the rich, linked list. */}
        <ul className="hidden flex-col gap-1 lg:flex">
          {listed.map((p) => {
            const profile = profileById.get(p.user_id);
            const name = profile?.display_name ?? profile?.email ?? "Someone";
            const isHostRow = p.user_id === tasting.host_id;
            const isViewerRow = viewerIsHost && isHostRow;
            const isDeleted = deletedUserIds.has(p.user_id);
            const stats = statsByUserId.get(p.user_id);
            const brings = isByo
              ? bringsWineLine(firstGlassByParticipant.get(p.id) ?? null)
              : null;
            const infoBits = [
              !isDeleted && profile?.location ? (
                <span key="loc" className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {profile.location}
                </span>
              ) : null,
              !isDeleted && profile?.favorite_wine_type ? (
                <span key="wine" className="flex items-center gap-1">
                  <Wine className="size-3" />
                  {profile.favorite_wine_type}
                </span>
              ) : null,
              !isDeleted && stats && stats.winesGuessed > 0 ? (
                <span key="stats">
                  {stats.tastingsAttended} tasting
                  {stats.tastingsAttended === 1 ? "" : "s"} ·{" "}
                  {stats.averagePoints.toFixed(1)} avg
                </span>
              ) : null,
              brings ? <span key="brings">{brings}</span> : null,
            ].filter(Boolean);
            return (
              <li key={p.user_id}>
                <RowFrame
                  href={isDeleted ? null : `/u/${p.user_id}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {profile?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.avatar_url}
                        alt=""
                        className="size-9 shrink-0 rounded-full object-cover ring-1 ring-border"
                      />
                    ) : (
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full text-sm",
                          // "You · host" gets a bordeaux avatar (LOBBY-18).
                          isViewerRow ? "bg-primary text-primary-foreground" : "bg-secondary",
                        )}
                      >
                        {name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {isViewerRow ? (
                          <span className="truncate">You · host</span>
                        ) : (
                          <>
                            <span className="truncate">{name}</span>
                            {isHostRow ? <Badge variant="secondary">Host</Badge> : null}
                          </>
                        )}
                      </span>
                      {infoBits.length > 0 ? (
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {infoBits}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {/* No status badge on "You · host" — the label already says it. */}
                  {isViewerRow ? null : (
                    <Badge variant={p.status === "JOINED" ? "default" : "outline"}>
                      {p.status === "JOINED" ? "In" : "Invited"}
                    </Badge>
                  )}
                </RowFrame>
              </li>
            );
          })}
        </ul>

        {/* Phone: plain chips (LOBBY-25) — no stats, no link. */}
        <div className="flex flex-wrap gap-2 lg:hidden">
          {listed.map((p) => {
            const profile = profileById.get(p.user_id);
            const name = profile?.display_name ?? profile?.email ?? "Someone";
            const isHostRow = p.user_id === tasting.host_id;
            const isViewerRow = viewerIsHost && isHostRow;
            const label = isViewerRow
              ? "You · host"
              : p.status === "JOINED"
                ? `${name} ✓`
                : `${name} · invited`;
            return (
              <span
                key={p.user_id}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium leading-normal",
                  isViewerRow && "bg-primary text-primary-foreground",
                  !isViewerRow && p.status === "JOINED" && "bg-muted text-foreground",
                  !isViewerRow &&
                    p.status === "INVITED" &&
                    "border border-gold-deep/50 text-gold-dark",
                )}
              >
                {label}
              </span>
            );
          })}
        </div>

        {declinedLine ? (
          <p className="text-xs text-muted-foreground">{declinedLine}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">{PARTICIPANTS_FOOTER}</p>
      </CardContent>
    </Card>
  );
}
