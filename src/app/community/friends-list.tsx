import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { FriendButton } from "@/components/friend-button";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

function activeLabel(iso: string | null): { text: string; fresh: boolean } | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  return {
    text: ms < 3600000 ? "Active now" : days < 1 ? "Active today" : `Active ${days}d ago`,
    fresh: ms < 86400000,
  };
}

// The "Friends" tab of /community: just your added friends.
export async function FriendsList({ userId }: { userId: string }) {
  const supabase = await createClient();

  const { data: friendRows } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", userId);
  const friendIds = (friendRows ?? []).map((f) => f.friend_id);

  const { data: friends } = await supabase
    .from("profiles")
    .select("id, display_name, bio, avatar_url, last_seen_at")
    .in("id", friendIds.length > 0 ? friendIds : [""])
    .order("display_name");

  if ((friends ?? []).length === 0) {
    return (
      <EmptyState
        title="No friends yet"
        description="Switch to the People tab to find and add fellow tasters."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {(friends ?? []).map((f) => {
        const active = activeLabel(f.last_seen_at);
        return (
          <Card key={f.id}>
            <CardContent className="flex items-center justify-between gap-4 pt-6">
              <Link href={`/u/${f.id}`} className="flex items-center gap-3">
                <Avatar src={f.avatar_url} name={f.display_name} size="lg" />
                <div>
                  <p className="font-medium">{f.display_name}</p>
                  {f.bio ? (
                    <p className="line-clamp-1 text-sm text-muted-foreground">{f.bio}</p>
                  ) : null}
                  {active ? (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          active.fresh ? "bg-green-600" : "bg-muted-foreground/40",
                        )}
                      />
                      {active.text}
                    </span>
                  ) : null}
                </div>
              </Link>
              <FriendButton friendId={f.id} isFriend={true} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
