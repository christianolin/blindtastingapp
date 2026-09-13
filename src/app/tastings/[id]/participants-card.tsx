import Link from "next/link";
import { MapPin, Wine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getParticipantRows, getTastingRow } from "@/lib/tasting-request-cache";
import { getBulkProfileSummaries } from "@/lib/profile-stats";

// Full participant roster with cross-tasting stats (BT-D2, moved without
// change from page.tsx): each row links to the person's profile and shows
// their avatar, a Host badge, their In/Invited/Declined status, a
// location/favorite-wine info line, and a cross-tasting stats line fetched
// via getBulkProfileSummaries — the batched helper, per its own rule about
// many-people stat surfaces.
export async function ParticipantsCard({
  tastingId,
}: {
  tastingId: string;
}): Promise<React.JSX.Element | null> {
  const supabase = await createClient();
  const [tasting, participantRows] = await Promise.all([
    getTastingRow(tastingId),
    getParticipantRows(tastingId),
  ]);
  if (!tasting) return null;

  const userIds = participantRows.map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email, avatar_url, location, favorite_wine_type")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const statsByUserId = await getBulkProfileSummaries(userIds);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Participants
          <span className="text-sm font-normal text-muted-foreground">
            {participantRows.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1">
          {participantRows.map((p) => {
            const profile = profileById.get(p.user_id);
            const name = profile?.display_name ?? profile?.email ?? "Someone";
            const stats = statsByUserId.get(p.user_id);
            const infoBits = [
              profile?.location ? (
                <span key="loc" className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {profile.location}
                </span>
              ) : null,
              profile?.favorite_wine_type ? (
                <span key="wine" className="flex items-center gap-1">
                  <Wine className="size-3" />
                  {profile.favorite_wine_type}
                </span>
              ) : null,
              stats && stats.winesGuessed > 0 ? (
                <span key="stats">
                  {stats.tastingsAttended} tasting
                  {stats.tastingsAttended === 1 ? "" : "s"} ·{" "}
                  {stats.averagePoints.toFixed(1)} avg pts
                </span>
              ) : null,
            ].filter(Boolean);
            return (
              <li key={p.user_id}>
                <Link
                  href={`/u/${p.user_id}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60"
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
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm">
                        {name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{name}</span>
                        {p.user_id === tasting.host_id ? (
                          <Badge variant="secondary">Host</Badge>
                        ) : null}
                      </span>
                      {infoBits.length > 0 ? (
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {infoBits}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <Badge variant={p.status === "JOINED" ? "default" : "outline"}>
                    {p.status === "JOINED"
                      ? "In"
                      : p.status === "INVITED"
                        ? "Invited"
                        : "Declined"}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
