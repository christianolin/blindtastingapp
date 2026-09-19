import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTrio } from "@/components/overview/stat-trio";
import { AppHeader } from "@/components/app-header";
import { FriendButton } from "@/components/friend-button";
import { InvitePeopleButton } from "@/components/invite/invite-people-button";
import { createClient } from "@/lib/supabase/server";
import { getProfileStats } from "@/lib/profile-stats";
import { DELETED_DISPLAY_NAME, profilePageView } from "@/lib/account/delete-account";
import { DELETED_PROFILE_LINE } from "@/lib/account/delete-copy";
import {
  accuracyView,
  emptyProfileCopy,
  profileMeta,
  profileStatTrio,
  profileTastingRows,
  shareRows,
  tastingsFooter,
} from "@/lib/profile/profile-view-math";
import { ProfileHeader } from "./profile-header";
import { ProfileStatCards } from "./profile-stat-cards";
import { ProfileTastings } from "./profile-tastings";

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

  // R9/§3 step 2: `me` (for AppHeader) and `profile` run in parallel — they
  // used to run in sequence.
  const [{ data: me }, { data: profile }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).single(),
    supabase
      .from("profiles")
      .select(
        "id, display_name, bio, avatar_url, location, favorite_wine_type, created_at, deleted_at",
      )
      .eq("id", id)
      .maybeSingle(),
  ]);
  if (!profile) {
    notFound();
  }

  const view = profilePageView({
    viewerId: user.id,
    profileId: profile.id,
    deletedAt: profile.deleted_at,
  });

  // D6/§2.7: a deleted account keeps its row (the tastings it hosted or
  // joined point at it), but its page is the name and one line — no photo,
  // stats, tastings list, joined date, friend button or cellar link. Returned
  // before any of the §3 step 4 reads below.
  if (view === "deleted") {
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
              <span aria-hidden className="size-24 rounded-full bg-secondary" />
              <div>
                <h1 className="font-heading text-2xl font-semibold">
                  {DELETED_DISPLAY_NAME}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {DELETED_PROFILE_LINE}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isOwnProfile = view === "own";
  const inviterName = me?.display_name ?? user.email ?? "";

  // R2/§3 step 4: friendship and the cellar gate are only meaningful for
  // someone else's profile; stats run either way. All three in parallel.
  const [friendshipResult, cellarResult, stats] = await Promise.all([
    isOwnProfile
      ? Promise.resolve(null)
      : supabase
          .from("friendships")
          .select("id")
          .eq("user_id", user.id)
          .eq("friend_id", profile.id)
          .maybeSingle(),
    isOwnProfile ? Promise.resolve(null) : supabase.rpc("can_view_cellar", { p_owner: profile.id }),
    getProfileStats(profile.id),
  ]);
  const isFriend = Boolean(friendshipResult?.data);
  // An RPC error hides the button rather than throwing (R2).
  const canViewCellar = cellarResult?.data === true;
  const { summary, tastings } = stats;

  const meta = profileMeta({
    location: profile.location,
    favoriteWineType: profile.favorite_wine_type,
    createdAt: profile.created_at,
  });
  const trio = profileStatTrio(summary);
  const accuracy = accuracyView(summary);
  const countries = shareRows(summary.topCountries);
  const regions = shareRows(summary.topRegions);
  const grapes = shareRows(summary.topGrapes);
  const rows = profileTastingRows(tastings, { profileId: profile.id, viewerId: user.id });
  const footer = tastingsFooter(rows.length);
  const empty = emptyProfileCopy({ isOwn: isOwnProfile, name: profile.display_name });

  const actions = isOwnProfile ? (
    <>
      <Button
        variant="outline"
        nativeButton={false}
        render={<Link href="/profile/edit" />}
        className="min-h-11 md:pointer-fine:min-h-9"
      >
        Edit profile
      </Button>
      <InvitePeopleButton inviterName={inviterName} />
    </>
  ) : (
    <>
      {canViewCellar ? (
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/u/${profile.id}/cellar`} />}
          className="min-h-11 md:pointer-fine:min-h-9"
        >
          Cellar
        </Button>
      ) : null}
      <FriendButton friendId={profile.id} isFriend={isFriend} variant="header" />
    </>
  );

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        userId={user.id}
        displayName={me?.display_name ?? user.email ?? ""}
        avatarUrl={me?.avatar_url ?? null}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-4 md:p-6">
        <ProfileHeader
          name={profile.display_name}
          avatarUrl={profile.avatar_url}
          isOwn={isOwnProfile}
          meta={meta}
          bio={profile.bio}
          actions={actions}
        />

        {summary.winesGuessed === 0 ? (
          <EmptyState title={empty.title} description={empty.body} />
        ) : (
          <>
            {trio ? <StatTrio stats={trio} /> : null}
            <ProfileStatCards
              accuracy={accuracy}
              countries={countries}
              regions={regions}
              grapes={grapes}
            />
            {rows.length > 0 ? <ProfileTastings rows={rows} footer={footer} /> : null}
          </>
        )}
      </div>
    </div>
  );
}
