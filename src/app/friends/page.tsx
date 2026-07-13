import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import { FriendButton } from "@/components/friend-button";
import { createClient } from "@/lib/supabase/server";

export default async function FriendsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single();

  const { data: friendRows } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", user.id);
  const friendIds = (friendRows ?? []).map((f) => f.friend_id);

  const { data: friends } = await supabase
    .from("profiles")
    .select("id, display_name, bio, avatar_url")
    .in("id", friendIds.length > 0 ? friendIds : [""])
    .order("display_name");

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        userId={user.id}
        displayName={me?.display_name ?? user.email ?? ""}
        avatarUrl={me?.avatar_url ?? null}
      />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Friends
          </h1>
          <Button nativeButton={false} render={<Link href="/people" />}>
            Find people
          </Button>
        </div>
        {(friends ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No friends added yet — find people to add them here for quick
            invites.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {(friends ?? []).map((f) => (
              <Card key={f.id}>
                <CardContent className="flex items-center justify-between gap-4 pt-6">
                  <Link
                    href={`/u/${f.id}`}
                    className="flex items-center gap-3"
                  >
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
        )}
      </div>
    </div>
  );
}
