import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/app-header";
import { FriendButton } from "@/components/friend-button";
import { createClient } from "@/lib/supabase/server";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
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

  let query = supabase
    .from("profiles")
    .select("id, display_name, bio, avatar_url")
    .order("display_name");
  if (q) {
    query = query.ilike("display_name", `%${q}%`);
  }
  const { data: profiles } = await query;

  const { data: friendRows } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", user.id);
  const friendIds = new Set((friendRows ?? []).map((f) => f.friend_id));

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        userId={user.id}
        displayName={me?.display_name ?? user.email ?? ""}
        avatarUrl={me?.avatar_url ?? null}
      />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          People
        </h1>
        <form method="GET" className="flex gap-2">
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name"
          />
        </form>
        <div className="flex flex-col gap-3">
          {(profiles ?? []).map((p) => {
            const isMe = p.id === user.id;
            return (
              <Card key={p.id}>
                <CardContent className="flex items-center justify-between gap-4 pt-6">
                  <Link
                    href={`/u/${p.id}`}
                    className="flex items-center gap-3"
                  >
                    {p.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatar_url}
                        alt=""
                        className="size-10 rounded-full object-cover ring-1 ring-border"
                      />
                    ) : (
                      <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
                        {p.display_name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div>
                      <p className="flex items-center gap-2 font-medium">
                        {p.display_name}
                        {isMe ? <Badge variant="secondary">You</Badge> : null}
                      </p>
                      {p.bio ? (
                        <p className="line-clamp-1 text-sm text-muted-foreground">
                          {p.bio}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                  {isMe ? null : (
                    <FriendButton
                      friendId={p.id}
                      isFriend={friendIds.has(p.id)}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
          {(profiles ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No one found.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
