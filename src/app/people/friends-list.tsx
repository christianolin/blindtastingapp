import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { FriendButton } from "@/components/friend-button";
import { createClient } from "@/lib/supabase/server";

// The "Friends" tab of /people: just your added friends.
export async function FriendsList({ userId }: { userId: string }) {
  const supabase = await createClient();

  const { data: friendRows } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", userId);
  const friendIds = (friendRows ?? []).map((f) => f.friend_id);

  const { data: friends } = await supabase
    .from("profiles")
    .select("id, display_name, bio, avatar_url")
    .in("id", friendIds.length > 0 ? friendIds : [""])
    .order("display_name");

  if ((friends ?? []).length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No friends added yet — switch to the People tab to find and add them
        for quick invites.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {(friends ?? []).map((f) => (
        <Card key={f.id}>
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <Link href={`/u/${f.id}`} className="flex items-center gap-3">
              {f.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.avatar_url}
                  alt=""
                  className="size-10 rounded-full object-cover ring-1 ring-border"
                />
              ) : (
                <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
                  {f.display_name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div>
                <p className="font-medium">{f.display_name}</p>
                {f.bio ? (
                  <p className="line-clamp-1 text-sm text-muted-foreground">
                    {f.bio}
                  </p>
                ) : null}
              </div>
            </Link>
            <FriendButton friendId={f.id} isFriend={true} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
