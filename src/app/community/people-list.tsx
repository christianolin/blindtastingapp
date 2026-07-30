import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FriendButton } from "@/components/friend-button";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { getBulkProfileSummaries } from "@/lib/profile-stats";

function activeLabel(iso: string | null): { text: string; fresh: boolean } | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  return {
    text: ms < 3600000 ? "Active now" : days < 1 ? "Active today" : `Active ${days}d ago`,
    fresh: ms < 86400000,
  };
}

// The "People" tab of /community: the full member directory with search.
export async function PeopleList({ q, userId }: { q?: string; userId: string }) {
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select("id, display_name, bio, avatar_url, location, created_at, last_seen_at")
    .order("display_name");
  if (q) {
    query = query.ilike("display_name", `%${q}%`);
  }
  const { data: profiles } = await query;

  const { data: friendRows } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", userId);
  const friendIds = new Set((friendRows ?? []).map((f) => f.friend_id));

  const statsByUserId = await getBulkProfileSummaries(
    (profiles ?? []).map((p) => p.id),
  );

  return (
    <>
      <form method="GET" className="flex gap-2">
        <Input name="q" defaultValue={q ?? ""} placeholder="Search by name" />
      </form>
      <div className="flex flex-col gap-3">
        {(profiles ?? []).map((p) => {
          const isMe = p.id === userId;
          const stats = statsByUserId.get(p.id);
          const active = activeLabel(p.last_seen_at);
          const joined = new Date(p.created_at).toLocaleDateString(undefined, {
            month: "short",
            year: "numeric",
          });
          return (
            <Card key={p.id}>
              <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  href={`/u/${p.id}`}
                  className="flex min-w-0 items-center gap-3"
                >
                  <Avatar src={p.avatar_url} name={p.display_name} size="lg" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {p.display_name}
                      {isMe ? <Badge variant="secondary">You</Badge> : null}
                    </p>
                    {p.bio ? (
                      <p className="line-clamp-1 text-sm text-muted-foreground">
                        {p.bio}
                      </p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {p.location ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" />
                          {p.location}
                        </span>
                      ) : null}
                      <span>Joined {joined}</span>
                      {active ? (
                        <span className="flex items-center gap-1">
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              active.fresh ? "bg-green-600" : "bg-muted-foreground/40",
                            )}
                          />
                          {active.text}
                        </span>
                      ) : null}
                      {stats && stats.winesGuessed > 0 ? (
                        <span>
                          {stats.tastingsAttended} tasting
                          {stats.tastingsAttended === 1 ? "" : "s"} ·{" "}
                          {stats.winesGuessed} wine
                          {stats.winesGuessed === 1 ? "" : "s"} ·{" "}
                          {stats.averagePoints.toFixed(1)} avg pts
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/u/${p.id}`} />}
                  >
                    Go to profile
                  </Button>
                  {isMe ? null : (
                    <FriendButton friendId={p.id} isFriend={friendIds.has(p.id)} />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {(profiles ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No one found.</p>
        ) : null}
      </div>
    </>
  );
}
