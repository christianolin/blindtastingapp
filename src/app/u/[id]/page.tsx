import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { FriendButton } from "@/components/friend-button";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, bio, avatar_url")
    .eq("id", id)
    .maybeSingle();
  if (!profile) {
    notFound();
  }

  const isOwnProfile = profile.id === user.id;

  let isFriend = false;
  if (!isOwnProfile) {
    const { data: friendship } = await supabase
      .from("friendships")
      .select("id")
      .eq("user_id", user.id)
      .eq("friend_id", profile.id)
      .maybeSingle();
    isFriend = Boolean(friendship);
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        userId={user.id}
        displayName={me?.display_name ?? user.email ?? ""}
        avatarUrl={me?.avatar_url ?? null}
      />
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-8">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="size-24 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <span className="flex size-24 items-center justify-center rounded-full bg-secondary text-3xl">
                {profile.display_name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <h1 className="font-heading text-2xl font-semibold">
                {profile.display_name}
              </h1>
              {profile.bio ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {profile.bio}
                </p>
              ) : null}
            </div>
            {isOwnProfile ? (
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/profile/edit" />}
              >
                Edit profile
              </Button>
            ) : (
              <FriendButton friendId={profile.id} isFriend={isFriend} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
