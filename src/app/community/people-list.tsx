import Link from "next/link";
import { MapPin, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { FriendButton } from "@/components/friend-button";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { getBulkProfileSummaries } from "@/lib/profile-stats";
import { PeopleSort } from "./people-sort";

const PAGE = 10;

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
export async function PeopleList({
  q,
  sort,
  page,
  userId,
}: {
  q?: string;
  sort?: string;
  page: number;
  userId: string;
}) {
  const supabase = await createClient();
  const sortKey = sort === "name" ? "name" : sort === "joined" ? "joined" : "active";

  let query = supabase
    .from("profiles")
    .select(
      "id, display_name, bio, avatar_url, location, created_at, last_seen_at, cellar_visibility",
      { count: "exact" },
    );
  if (q) {
    query = query.or(
      `display_name.ilike.%${q}%,bio.ilike.%${q}%,location.ilike.%${q}%`,
    );
  }
  query =
    sortKey === "name"
      ? query.order("display_name", { ascending: true })
      : sortKey === "joined"
        ? query.order("created_at", { ascending: false })
        : query.order("last_seen_at", { ascending: false, nullsFirst: false });

  const from = (page - 1) * PAGE;
  const { data: profiles, count } = await query.range(from, from + PAGE - 1);
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE));
  const hrefFor = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (sort) sp.set("sort", sort);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/community?${qs}` : "/community";
  };

  const { data: friendRows } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", userId);
  const friendIds = new Set((friendRows ?? []).map((f) => f.friend_id));

  const pageIds = (profiles ?? []).map((p) => p.id);
  const { data: theirFriendRows } = await supabase
    .from("friendships")
    .select("user_id, friend_id")
    .in("user_id", pageIds.length > 0 ? pageIds : [""]);
  const friendsByUser = new Map<string, Set<string>>();
  for (const r of theirFriendRows ?? []) {
    const set = friendsByUser.get(r.user_id) ?? new Set<string>();
    set.add(r.friend_id);
    friendsByUser.set(r.user_id, set);
  }
  const mutualCount = (pid: string): number => {
    const theirs = friendsByUser.get(pid);
    if (!theirs) return 0;
    let n = 0;
    for (const f of theirs) if (friendIds.has(f)) n += 1;
    return n;
  };

  const statsByUserId = await getBulkProfileSummaries(
    (profiles ?? []).map((p) => p.id),
  );

  return (
    <>
      <form method="GET" className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name, location or bio…"
          className="w-full pl-9"
        />
        {sort ? <input type="hidden" name="sort" value={sort} /> : null}
      </form>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Showing {total} {total === 1 ? "person" : "people"}
        </p>
        <PeopleSort value={sortKey} q={q} />
      </div>
      <div className="flex flex-col gap-3">
        {(profiles ?? []).map((p) => {
          const isMe = p.id === userId;
          const stats = statsByUserId.get(p.id);
          const active = activeLabel(p.last_seen_at);
          const mutual = isMe ? 0 : mutualCount(p.id);
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
                      {mutual > 0 ? (
                        <span className="flex items-center gap-1">
                          <Users className="size-3" />
                          {mutual} mutual
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
                  {!isMe && p.cellar_visibility !== "PRIVATE" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/u/${p.id}/cellar`} />}
                    >
                      Cellar
                    </Button>
                  ) : null}
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
      <Pagination page={page} pageCount={pageCount} hrefFor={hrefFor} />
    </>
  );
}
