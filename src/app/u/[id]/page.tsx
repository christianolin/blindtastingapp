import Link from "next/link";
import { MapPin, Wine as WineIcon } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { FriendButton } from "@/components/friend-button";
import { createClient } from "@/lib/supabase/server";
import { getProfileStats, type CategoryKey } from "@/lib/profile-stats";
import { FAVORITE_WINE_TYPE_ITEMS } from "@/lib/wine-types";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  country: "Country",
  region: "Region",
  appellation: "Appellation",
  primary_grape: "Primary grape",
  secondary_grape: "Secondary grape",
  producer: "Producer",
  type_designation: "Type designation",
  vintage: "Vintage",
};

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
    .select(
      "id, display_name, bio, avatar_url, location, favorite_wine_type, created_at",
    )
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

  const { summary, tastings } = await getProfileStats(profile.id);

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
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {profile.location ? (
                  <Badge variant="secondary" className="gap-1">
                    <MapPin className="size-3" />
                    {profile.location}
                  </Badge>
                ) : null}
                {profile.favorite_wine_type ? (
                  <Badge variant="secondary" className="gap-1">
                    <WineIcon className="size-3" />
                    {FAVORITE_WINE_TYPE_ITEMS[profile.favorite_wine_type] ??
                      profile.favorite_wine_type}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Joined{" "}
                {new Date(profile.created_at).toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </p>
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

        {summary.winesGuessed > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Tasting stats</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="font-heading text-2xl font-semibold">
                    {summary.tastingsAttended}
                  </p>
                  <p className="text-xs text-muted-foreground">Tastings</p>
                </div>
                <div>
                  <p className="font-heading text-2xl font-semibold">
                    {summary.winesGuessed}
                  </p>
                  <p className="text-xs text-muted-foreground">Wines guessed</p>
                </div>
                <div>
                  <p className="font-heading text-2xl font-semibold">
                    {summary.averagePoints.toFixed(1)}
                  </p>
                  <p className="text-xs text-muted-foreground">Avg pts / wine</p>
                </div>
              </div>

              {summary.bestCategory ? (
                <div className="rounded-lg bg-primary/8 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Strongest at:</span>{" "}
                  <span className="font-medium">
                    {CATEGORY_LABELS[summary.bestCategory.key]}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    ({Math.round(summary.bestCategory.pct * 100)}% —{" "}
                    {summary.bestCategory.correct}/{summary.bestCategory.applicable})
                  </span>
                </div>
              ) : null}

              <div>
                <h3 className="mb-2 text-sm font-medium">Accuracy by category</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {(Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((key) => {
                      const { correct, applicable } = summary.categoryAccuracy[key];
                      if (applicable === 0) return null;
                      const pct = Math.round((correct / applicable) * 100);
                      return (
                        <tr key={key} className="border-b last:border-0">
                          <td className="py-1 text-muted-foreground">
                            {CATEGORY_LABELS[key]}
                            {key === "vintage" && summary.vintagePartialCredit > 0
                              ? ` (+${summary.vintagePartialCredit} off by 1yr)`
                              : ""}
                          </td>
                          <td className="py-1 text-right">
                            {correct}/{applicable} ({pct}%)
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {summary.topCountries.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <h3 className="mb-2 text-sm font-medium">Top countries</h3>
                    <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                      {summary.topCountries.map((c) => (
                        <li key={c.id} className="flex justify-between gap-2">
                          <span className="truncate">{c.name}</span>
                          <span className="shrink-0">{c.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-medium">Top regions</h3>
                    <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                      {summary.topRegions.map((r) => (
                        <li key={r.id} className="flex justify-between gap-2">
                          <span className="truncate">{r.name}</span>
                          <span className="shrink-0">{r.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-medium">Top grapes</h3>
                    <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                      {summary.topGrapes.map((g) => (
                        <li key={g.id} className="flex justify-between gap-2">
                          <span className="truncate">{g.name}</span>
                          <span className="shrink-0">{g.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {tastings.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Tastings attended</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {tastings.map((t) => (
                  <li key={t.tastingId}>
                    <Link
                      href={`/u/${profile.id}/tastings/${t.tastingId}`}
                      className="flex items-center justify-between gap-4 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <span>
                        <span className="font-medium">{t.tastingName}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          — hosted by {t.hostName}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant="secondary">
                          {t.winesRevealed} wine{t.winesRevealed === 1 ? "" : "s"}
                        </Badge>
                        <span className="font-medium">{t.pointsEarned} pts</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
